export const register = (navi) => {
  const INDEX_KEY = "avh:index";
  const CODE_RE = /^[0-9]{5}$/;
  const ownerKey = (code) => `avh:owners/${code}`;

  function validateCode(code) {
    if (!CODE_RE.test(code)) {
      throw new Error("Owner code must be exactly 5 digits");
    }
  }

  async function loadIndex() {
    const raw = await navi.storage.item.get(INDEX_KEY);
    return Array.isArray(raw) ? raw.slice() : [];
  }

  async function saveIndex(codes) {
    await navi.storage.item.set(INDEX_KEY, codes);
  }

  async function getOwner(code) {
    validateCode(code);
    return await navi.storage.item.get(ownerKey(code));
  }

  async function saveOwner(owner) {
    validateCode(owner.code);
    await navi.storage.item.set(ownerKey(owner.code), owner);
    const index = await loadIndex();
    if (!index.includes(owner.code)) {
      index.push(owner.code);
      index.sort();
      await saveIndex(index);
    }
    return owner;
  }

  function newPetId(code) {
    return `pet-${code}-${Date.now().toString(36)}`;
  }

  function newDocId(code) {
    return `doc-${code}-${Date.now().toString(36)}`;
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function legacyArchiveKey(owner) {
    let key = new Date().toISOString();
    const legacy = owner.legacy_documents;
    if (legacy && typeof legacy === "object" && legacy[key]) {
      key = `${key}-${Math.random().toString(36).slice(2, 8)}`;
    }
    return key;
  }

  function archiveDocument(owner, doc, reason) {
    if (!owner.legacy_documents || typeof owner.legacy_documents !== "object") {
      owner.legacy_documents = {};
    }
    const key = legacyArchiveKey(owner);
    owner.legacy_documents[key] = {
      reason,
      archivedAt: key,
      document: cloneJson(doc),
    };
    return key;
  }

  function findDocIndex(owner, docId) {
    return owner.documents.findIndex((d) => d.id === docId);
  }

  function defaultPet(code) {
    return {
      id: newPetId(code),
      name: "Pet",
      species: "unknown",
    };
  }

  function findPet(owner, petId) {
    return owner?.pets?.find((p) => p.id === petId) || null;
  }

  function petDetailsDoc(owner, petId) {
    return owner?.documents?.find(
      (d) =>
        d.type === "virtual" &&
        d.petId === petId &&
        d.content?.recordKind === "pet_details"
    );
  }

  const registry = {
    validateCode,
    loadIndex,
    getOwner,
    saveOwner,
    async lookup(code) {
      const owner = await getOwner(code);
      if (owner) {
        // Fact emission — for logging/tools; UI must not auto-react (flow conducts)
        navi.emit("owner_found", owner);
        return owner;
      }
      navi.emit("owner_missing", { code });
      return null;
    },
    async create(code, ownerName, pets) {
      validateCode(code);
      if (!ownerName || !ownerName.trim()) {
        throw new Error("ownerName is required");
      }
      const existing = await getOwner(code);
      if (existing) {
        throw new Error(`Owner record already exists for code ${code}`);
      }
      let petList;
      if (Array.isArray(pets)) {
        petList = pets
          .filter((p) => p?.name?.trim())
          .map((p) => ({
            id: p.id || newPetId(code),
            name: p.name.trim(),
            species: (p.species || "unknown").trim() || "unknown",
          }));
      } else {
        petList = [defaultPet(code)];
      }
      const owner = {
        code,
        ownerName: ownerName.trim(),
        pets: petList,
        documents: [],
        legacy_documents: {},
      };
      await saveOwner(owner);
      navi.emit("owner_created", owner);
      return owner;
    },
    async addPet(code, name, species = "unknown") {
      const owner = await getOwner(code);
      if (!owner) {
        throw new Error(`No owner for code ${code}`);
      }
      const pet = {
        id: newPetId(code),
        name: name.trim(),
        species: species.trim() || "unknown",
      };
      owner.pets.push(pet);
      await saveOwner(owner);
      navi.emit("pet_added", { code, pet });
      return pet;
    },
    async createPetDetailsDoc(code, petId) {
      const owner = await getOwner(code);
      if (!owner) throw new Error(`No owner for code ${code}`);
      const pet = findPet(owner, petId);
      if (!pet) throw new Error("pet not found");
      const existing = petDetailsDoc(owner, petId);
      if (existing) return existing;
      const doc = {
        id: newDocId(code),
        type: "virtual",
        title: `${pet.name} — details`,
        created: new Date().toISOString(),
        petId,
        content: {
          recordKind: "pet_details",
          viewTemplate: "pet_details",
          name: pet.name,
          species: pet.species || "",
          sex: "",
          age: "",
          misc: "",
        },
      };
      return this.addDoc(code, doc);
    },

    async createVirtualRecord(code, { petId, title, content, recordKind } = {}) {
      const owner = await getOwner(code);
      if (!owner) throw new Error(`No owner for code ${code}`);
      const body = { ...(content || {}) };
      if (recordKind) {
        body.recordKind = recordKind;
        if (recordKind === "pet_details") body.viewTemplate = "pet_details";
      }
      const doc = {
        id: newDocId(code),
        type: "virtual",
        title: (title || "Untitled record").trim() || "Untitled record",
        created: new Date().toISOString(),
        content: body,
      };
      if (petId) doc.petId = petId;
      return this.addDoc(code, doc);
    },

    async addDoc(code, doc) {
      const owner = await getOwner(code);
      if (!owner) {
        throw new Error(`No owner for code ${code}`);
      }
      owner.documents.push(doc);
      await saveOwner(owner);
      navi.emit("document_added", { code, doc });
      return doc;
    },

    async updateVirtualDoc(code, docId, patch) {
      const owner = await getOwner(code);
      if (!owner) throw new Error(`No owner for code ${code}`);
      const idx = findDocIndex(owner, docId);
      if (idx === -1) throw new Error("document not found");
      const doc = owner.documents[idx];
      if (doc.type !== "virtual") throw new Error("only virtual documents can be edited");

      archiveDocument(owner, doc, "edit");

      if (doc.content?.recordKind === "pet_details") {
        const fields = ["name", "species", "sex", "age", "misc"];
        doc.content = { ...doc.content };
        for (const key of fields) {
          if (patch[key] !== undefined) doc.content[key] = String(patch[key]);
        }
        const pet = findPet(owner, doc.petId);
        if (pet) {
          if (patch.name !== undefined) {
            const nextName = String(patch.name).trim();
            if (nextName) pet.name = nextName;
          }
          if (patch.species !== undefined) {
            pet.species = String(patch.species).trim() || "unknown";
          }
        }
        const displayName = (doc.content.name || pet?.name || "Pet").trim();
        if (patch.title !== undefined) {
          doc.title = String(patch.title).trim() || `${displayName} — details`;
        } else {
          doc.title = `${displayName} — details`;
        }
      } else {
        if (patch.title !== undefined) {
          doc.title = String(patch.title).trim() || doc.title;
        }
        if (patch.notes !== undefined) {
          doc.content = { ...(doc.content || {}), notes: String(patch.notes) };
        }
        if (patch.parseLayout !== undefined) {
          doc.content = {
            ...(doc.content || {}),
            parseLayout: patch.parseLayout,
            parseArtifact: patch.parseLayout?.version || "layout_v1",
            viewTemplate: "layout_v1",
          };
          if (patch.notes === undefined && patch.parseLayout?.notes != null) {
            doc.content.notes = String(patch.parseLayout.notes);
          }
        }
      }
      doc.updated = new Date().toISOString();
      owner.documents[idx] = doc;
      await saveOwner(owner);
      navi.emit("document_updated", { code, doc });
      return doc;
    },

    async deleteVirtualDoc(code, docId) {
      const owner = await getOwner(code);
      if (!owner) throw new Error(`No owner for code ${code}`);
      const idx = findDocIndex(owner, docId);
      if (idx === -1) throw new Error("document not found");
      const doc = owner.documents[idx];
      if (doc.type !== "virtual") throw new Error("only virtual documents can be deleted");

      archiveDocument(owner, doc, "delete");
      owner.documents.splice(idx, 1);
      await saveOwner(owner);
      navi.emit("document_deleted", { code, docId, doc });
      return doc;
    },

    async importOwners(owners) {
      if (!Array.isArray(owners)) {
        throw new Error("owners must be an array");
      }
      let count = 0;
      for (const owner of owners) {
        validateCode(owner.code);
        await saveOwner({
          code: owner.code,
          ownerName: owner.ownerName,
          pets: owner.pets || [defaultPet(owner.code)],
          documents: owner.documents || [],
          legacy_documents: owner.legacy_documents || {},
        });
        count++;
      }
      return count;
    },
    newDocId,
  };

  return {
    name: "avh_registry",
    version: "0.1.4",
    description: "AVH owner/pet/document registry (L1, programmatic API only)",

    moduleInfo: {
      name: "avh_registry",
      version: "0.1.4",
      description: "AVH owner/pet/document registry (L1, programmatic API only)",
    },

    registry,

    onMount: async () => {
      navi.callout("[avh_registry] L1 registry ready (programmatic API)");
    },

    // No commands → no callin listener. onUnmount only needed for DOM/timers/manual navi.on listeners.
  };
};
