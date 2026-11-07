export const register = (navi) => {
  const REGISTRY_NAME = "avh_registry";
  /** Init reads sibling routes from hostpark via config.json */
  const CONFIG_ROUTE = "torus/devops/AVHRecordViewer/config.json";

  let projectConfig = null;
  let registryMountedByInit = false;
  let managerMountedByInit = false;

  function assetUrl(route) {
    const rel = String(route || "").replace(/^\//, "");
    if (typeof navi !== "undefined" && typeof navi.resolveUrl === "function") {
      return navi.resolveUrl(rel);
    }
    return "/" + rel;
  }

  async function loadProjectConfig() {
    if (projectConfig) return projectConfig;
    const res = await globalThis.fetch(assetUrl(CONFIG_ROUTE), { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`failed to load config (${res.status}): ${CONFIG_ROUTE}`);
    }
    projectConfig = await res.json();
    return projectConfig;
  }

  async function fetchAsset(route, accept) {
    const res = await globalThis.fetch(assetUrl(route), {
      cache: "no-store",
      headers: accept ? { Accept: accept } : undefined,
    });
    if (!res.ok) throw new Error(`fetch ${route} (${res.status})`);
    return res;
  }

  const flowerpotUrl = assetUrl;
  const fetchFlowerpot = fetchAsset;

  async function ensureRegistry() {
    if (!navi.mod[REGISTRY_NAME]) {
      throw new Error(`${REGISTRY_NAME} is not mounted — run: avh_record_viewer start`);
    }
    return navi.mod[REGISTRY_NAME];
  }

  async function mountRegistry(source = "hostpark") {
    if (navi.mod[REGISTRY_NAME]) return navi.mod[REGISTRY_NAME];

    const cfg = await loadProjectConfig();

    if (source === "local") {
      const cacheKey =
        cfg.navi_storage?.registry_cache ||
        "mod:torus/devops/AVHRecordViewer/modules/avh_registry.js";
      const entry = await navi.storage.file.get(cacheKey);
      if (!entry?.media) {
        throw new Error("registry not in navi storage; use: avh_record_viewer start");
      }
      await navi.mount(entry.media);
    } else {
      const route = cfg.flowerpot?.registry_module;
      if (!route) throw new Error("config missing flowerpot.registry_module");
      const res = await fetchFlowerpot(
        route,
        "application/javascript, application/navi-module, text/javascript"
      );
      await navi.mount(await res.text());
    }

    registryMountedByInit = true;
    return ensureRegistry();
  }

  async function mountManager() {
    const MANAGER_NAME = "avh_manager";
    if (navi.mod[MANAGER_NAME]) return navi.mod[MANAGER_NAME];

    const cfg = await loadProjectConfig();
    const route = cfg.flowerpot?.manager_module;
    if (!route) throw new Error("config missing flowerpot.manager_module");
    const res = await fetchFlowerpot(
      route,
      "application/javascript, application/navi-module, text/javascript"
    );
    await navi.mount(await res.text());
    managerMountedByInit = true;
    return navi.mod[MANAGER_NAME];
  }

  function helpText() {
    return [
      "avh_record_viewer v0.1.3",
      "",
      "Usage:",
      "  avh_record_viewer start [hostpark|local]  Mount registry + seed if empty",
      "  avh_record_viewer bootstrap               Mount registry + manager + open entry screen",
      "  avh_record_viewer lookup <code>",
      "  avh_record_viewer get_owner <code>",
      "  avh_record_viewer list",
      "  avh_record_viewer create <code> <ownerName...>",
      "  avh_record_viewer add_pet <code> <name> [species]",
      "  avh_record_viewer add_doc <code> virtual|scan <title...>",
      "  avh_record_viewer seed [force]",
      "",
      "Artifact routes loaded from /" + CONFIG_ROUTE,
    ].join("\n");
  }

  const subcommands = {
    async start(source = "hostpark") {
      const mod = await mountRegistry(source === "local" ? "local" : "hostpark");
      const { registry } = mod;
      const index = await registry.loadIndex();
      if (!index.length) {
        return await subcommands.seed();
      }
      return `Ready: ${index.length} owner(s) in registry`;
    },

    async lookup(code) {
      if (!code) return "Usage: avh_record_viewer lookup <code>";
      const { registry } = await ensureRegistry();
      const owner = await registry.lookup(code);
      return owner
        ? `Found: ${owner.ownerName} (${owner.pets.length} pets, ${owner.documents.length} docs)`
        : `No record for code ${code}`;
    },

    async get_owner(code) {
      if (!code) return "Usage: avh_record_viewer get_owner <code>";
      const { registry } = await ensureRegistry();
      const owner = await registry.getOwner(code);
      return owner ? JSON.stringify(owner, null, 2) : `No record for code ${code}`;
    },

    async list() {
      const { registry } = await ensureRegistry();
      const index = await registry.loadIndex();
      return index.length ? index.join("\n") : "No owner records";
    },

    async create(code, ...nameParts) {
      if (!code || !nameParts.length) {
        return "Usage: avh_record_viewer create <code> <ownerName...>";
      }
      const { registry } = await ensureRegistry();
      const owner = await registry.create(code, nameParts.join(" "));
      return `Created ${owner.code}: ${owner.ownerName} (${owner.pets.length} pet(s))`;
    },

    async add_pet(code, name, species) {
      if (!code || !name) return "Usage: avh_record_viewer add_pet <code> <name> [species]";
      const { registry } = await ensureRegistry();
      const pet = await registry.addPet(code, name, species);
      return `Added pet ${pet.name} (${pet.species}) to ${code}`;
    },

    async add_doc(code, type, ...titleParts) {
      if (!code || !type || !titleParts.length) {
        return "Usage: avh_record_viewer add_doc <code> virtual|scan <title...>";
      }
      const { registry } = await ensureRegistry();
      const title = titleParts.join(" ");
      const now = new Date().toISOString();
      let doc;
      if (type === "virtual") {
        doc = {
          id: registry.newDocId(code),
          type: "virtual",
          title,
          created: now,
          content: { notes: "Demo record", status: "placeholder" },
        };
      } else if (type === "scan") {
        const id = registry.newDocId(code);
        doc = {
          id,
          type: "scan",
          title,
          created: now,
          storagePath: `avh:owners/${code}/documents/${id}.jpg`,
          mime: "image/jpeg",
        };
      } else {
        return "type must be virtual or scan";
      }
      await registry.addDoc(code, doc);
      return `Added ${type} doc: ${doc.title} (${doc.id})`;
    },

    async seed(forceFlag) {
      const { registry } = await ensureRegistry();
      const index = await registry.loadIndex();
      if (index.length && forceFlag !== "force") {
        return `Index has ${index.length} owner(s). Use: avh_record_viewer seed force`;
      }
      const cfg = await loadProjectConfig();
      const route = cfg.flowerpot?.seed_data;
      if (!route) throw new Error("config missing flowerpot.seed_data");
      const res = await fetchFlowerpot(route);
      const body = JSON.parse(await res.text());
      const count = await registry.importOwners(body.owners || []);
      return `Seeded ${count} owner record(s) from hostpark`;
    },

    async bootstrap() {
      await subcommands.start();
      const mgrMod = await mountManager();
      const url = await mgrMod.manager.bootstrap();
      return `Bootstrap complete → ${url}`;
    },
  };

  return {
    name: "avh_init",
    version: "0.1.3",
    description: "AVH Record Viewer callin surface",

    moduleInfo: {
      name: "avh_init",
      version: "0.1.3",
      description: "AVH Record Viewer callin surface",
    },

    loadProjectConfig,
    flowerpotUrl,
    assetUrl,
    subcommands,

    commands: {
      bootstrap: {
        name: "bootstrap",
        description: "avh_init bootstrap — mount registry + manager + open entry",
        execute: async () => subcommands.bootstrap(),
      },
      avh: {
        name: "avh_record_viewer",
        description: "avh_record_viewer <subcommand> [args...]",
        execute: async (sub, ...args) => {
          if (!sub) return helpText();
          const handler = subcommands[sub];
          if (!handler) {
            return `Unknown subcommand: ${sub}\n\n${helpText()}`;
          }
          try {
            return await handler(...args);
          } catch (e) {
            return `Error: ${e.message}`;
          }
        },
      },
    },

    onMount: async () => {
      navi.callout("[avh_init] callin: avh_record_viewer <subcommand>");
    },

    onUnmount: () => {
      if (managerMountedByInit && navi.mod.avh_manager) {
        navi.unmount(navi.mod.avh_manager);
        managerMountedByInit = false;
      }
      if (registryMountedByInit && navi.mod[REGISTRY_NAME]) {
        navi.unmount(navi.mod[REGISTRY_NAME]);
        registryMountedByInit = false;
      }
      projectConfig = null;
    },
  };
};
