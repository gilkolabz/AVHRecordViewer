export const register = (navi) => {
  const MANAGER_VERSION = "0.1.24";
  const MAINTAINER = "Gilkolabz";
  const REGISTRY_NAME = "avh_registry";
  const CONFIG_ROUTE = "torus/devops/AVHRecordViewer/config.json";
  const SESSION_PENDING = "avh:session:pending_code";
  const SESSION_ACTIVE = "avh:session:active_code";
  const SESSION_FLOW = "avh:session:flow_artifact";
  const SESSION_DOC = "avh:session:active_doc_id";
  const SESSION_PREFS = "avh:prefs";
  const SESSION_PARSE = "avh:session:pending_parse";
  const SESSION_FOLDER_PAGE = "avh:session:folder_page_index";
  const SESSION_SYSTEM_RETURN = "avh:session:system_return";
  const SESSION_FEEDBACK_RETURN = "avh:session:feedback_return";
  const SESSION_FILING_PET = "avh:session:filing_pet_id";
  const SESSION_DOC_ADD_PET = "avh:session:doc_add_pet_id";
  const SESSION_PROGRAM = "avh:session:program_id";
const SESSION_PWA_LAUNCH = "avh:session:pwa_launch_path";
  const PROGRAMS_ROUTE = "torus/devops/AVHRecordViewer/data/programs.json";
  const LAUNCH_INDEX_ROUTE = "torus/devops/AVHRecordViewer/data/launch_index.json";
  const SYSTEM_MODULE_ROUTE = "torus/devops/AVHRecordViewer/modules/avh_system.js";
  const OCR_MODULE_ROUTE = "torus/devops/AVHRecordViewer/modules/avh_ocr.js";
  const PARSE_MODULE_ROUTE = "torus/devops/AVHRecordViewer/modules/avh_parse.js";
  const VIRTUAL_VIEW_MODULE_ROUTE = "torus/devops/AVHRecordViewer/modules/avh_virtual_view.js";

  const COLOR_CSS = {
    orange: "#ff9800",
    red: "#e53935",
    yellow: "#fdd835",
    lime: "#c0ca33",
    green: "#43a047",
    teal: "#00897b",
    blue: "#1e88e5",
    indigo: "#3949ab",
    purple: "#8e24aa",
    magenta: "#d81b60",
  };

  let projectConfig = null;
  let flow = null;
  let digitColors = null;
  let programsDoc = null;
  let launchIndex = null;

  function assetUrl(route) {
    const rel = String(route || "").replace(/^\//, "");
    if (typeof navi !== "undefined" && typeof navi.resolveUrl === "function") {
      return navi.resolveUrl(rel);
    }
    return "/" + rel;
  }

  const flowerpotUrl = assetUrl;

  async function loadProjectConfig() {
    if (projectConfig) return projectConfig;
    const res = await globalThis.fetch(assetUrl(CONFIG_ROUTE), { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`failed to load config (${res.status}): ${CONFIG_ROUTE}`);
    }
    projectConfig = await res.json();
    return projectConfig;
  }

  async function fetchFlowerpot(route, accept) {
    const res = await globalThis.fetch(assetUrl(route), {
      cache: "no-store",
      headers: accept ? { Accept: accept } : undefined,
    });
    if (!res.ok) throw new Error(`fetch ${route} (${res.status})`);
    return res;
  }

  function parseDigitColorsSchema(schema) {
    const map = {};
    for (const [digit, spec] of Object.entries(schema.properties || {})) {
      if (spec?.const) map[digit] = spec.const;
    }
    return map;
  }

  function petDetailsDocFromOwner(owner, petId) {
    return owner?.documents?.find(
      (d) =>
        d.type === "virtual" &&
        d.petId === petId &&
        d.content?.recordKind === "pet_details"
    );
  }

  async function ensureRegistry() {
    if (!navi.mod[REGISTRY_NAME]) {
      throw new Error(`${REGISTRY_NAME} not mounted — run: avh_record_viewer bootstrap`);
    }
    return navi.mod[REGISTRY_NAME].registry;
  }

  function ensureSurf() {
    const surf = navi.mod.surf?.surf;
    if (!surf) {
      throw new Error("surf module not mounted — surf is required for navigation");
    }
    return surf;
  }

  function logicalRootFromConfig(cfg) {
    return cfg?.logical_root || cfg?.flowerpot?.logical_root || "torus/devops/AVHRecordViewer";
  }

  function pwaFaviconHref(cfg) {
    const logicalRoot = logicalRootFromConfig(cfg);
    const route = cfg?.pwa?.favicon_route || `${logicalRoot}/favicon.ico`;
    return "/" + String(route).replace(/^\//, "");
  }

  function absoluteAppUrl(pathOrUrl) {
    if (!pathOrUrl) return pathOrUrl;
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const origin = globalThis.location?.origin;
    if (!origin) return pathOrUrl;
    return new URL(pathOrUrl, origin).href;
  }

  async function loadProgramsDoc() {
    if (programsDoc) return programsDoc;
    const res = await fetchFlowerpot(PROGRAMS_ROUTE);
    programsDoc = JSON.parse(await res.text());
    return programsDoc;
  }

  async function loadLaunchIndex() {
    if (launchIndex) return launchIndex;
    const res = await fetchFlowerpot(LAUNCH_INDEX_ROUTE);
    launchIndex = JSON.parse(await res.text());
    return launchIndex;
  }

  function launchLeafFromRoute(route) {
    if (!route) return "launch";
    return String(route).split("/").pop().replace(/\.html$/i, "");
  }

  function flowerpotPathFromRoute(route) {
    const rel = String(route || "").replace(/^\//, "");
    return "/" + rel;
  }

  async function resolveLaunchNode(program) {
    const index = launchIndex || (await loadLaunchIndex());
    const nodes = index?.nodes || [];
    if (program?.launch_id) {
      const byLaunch = nodes.find((n) => n.id === program.launch_id);
      if (byLaunch) return byLaunch;
    }
    if (program?.id) {
      const byProgram = nodes.find((n) => n.program_id === program.id);
      if (byProgram) return byProgram;
    }
    const saved = (await navi.storage.item.get(SESSION_PWA_LAUNCH)) || "";
    if (saved) {
      const byPath = nodes.find((n) => {
        if (!n.route) return false;
        const launchPath = flowerpotPathFromRoute(n.route);
        return saved === launchPath || saved.endsWith(`/${launchLeafFromRoute(n.route)}.html`);
      });
      if (byPath) return byPath;
    }
    return nodes.find((n) => n.legacy_id === "launch_baseline") || nodes.find((n) => n.program_id) || null;
  }

  const manager = {
    async setProgramId(programId) {
      if (programId) {
        await navi.storage.item.set(SESSION_PROGRAM, programId);
      } else {
        await navi.storage.item.del(SESSION_PROGRAM);
      }
      if (typeof document !== "undefined") {
        await this.applyProgramPwa();
      }
    },

    async resolveActiveProgram() {
      const doc = await loadProgramsDoc();
      const programs = Object.values(doc?.programs || {});
      const programId = await navi.storage.item.get(SESSION_PROGRAM);
      if (programId) {
        return programs.find((p) => p.id === programId) || null;
      }

      if (!flow) await this.loadFlow();
      const flowRoute =
        (await navi.storage.item.get(SESSION_FLOW)) ||
        (await loadProjectConfig()).flowerpot?.flow_artifact;
      const index = await loadLaunchIndex();
      const node = (index?.nodes || []).find((n) => {
        if (!flowRoute || !flow?.id) return false;
        return String(flowRoute).includes(`/flow/${flow.id}.json`);
      });
      if (node?.program_id) {
        return programs.find((p) => p.id === node.program_id) || null;
      }
      return programs[0] || null;
    },

    async applyProgramPwa() {
      const pwa = globalThis.navi?.pwa;
      if (typeof document === "undefined" || typeof pwa?.set !== "function") {
        return null;
      }

      const cfg = await loadProjectConfig();
      const doc = await loadProgramsDoc();
      const defaults = { ...(cfg.pwa || {}), ...(doc?.pwa_defaults || {}) };
      const program = await this.resolveActiveProgram();
      const launchNode = await resolveLaunchNode(program);

      const logicalRoot = logicalRootFromConfig(cfg);
      const scopePath = `/${logicalRoot.replace(/^\//, "")}/`;
      const startPath = launchNode?.route
        ? flowerpotPathFromRoute(launchNode.route)
        : `${scopePath}ui/launch.html`;
      const faviconPath = pwaFaviconHref(cfg);
      const description = String(
        defaults.description ||
          "Vet clinic demo on foobarch - numpad journey, folder layouts, and composable programs."
      ).replace(/\u2014/g, "-");

      const pwaConfig = {
        id: absoluteAppUrl(startPath),
        name: defaults.name || "AVH Record Viewer",
        short_name: defaults.short_name || "AVH",
        description,
        start_url: absoluteAppUrl(startPath),
        scope: absoluteAppUrl(scopePath),
        display: "standalone",
        background_color: defaults.background_color || "#fffef8",
        theme_color: defaults.theme_color || "#00897b",
        replace_state: startPath,
        icons: [
          {
            src: absoluteAppUrl(faviconPath),
            sizes: "any",
            type: "image/x-icon",
            purpose: "any",
          },
        ],
        lang: "en",
      };

      pwa.set(pwaConfig);

      navi.callout(`[avh_manager] PWA → ${startPath}`);

      return { pwaConfig, program, launchNode };
    },

    async savePwaLaunchContext() {
      if (typeof globalThis.location?.pathname !== "string") return null;
      const path = `${globalThis.location.pathname}${globalThis.location.search || ""}`;
      if (path && path !== "/") {
        await navi.storage.item.set(SESSION_PWA_LAUNCH, path);
        return path;
      }
      const program = await this.resolveActiveProgram();
      const launchNode = await resolveLaunchNode(program);
      if (launchNode?.route) {
        const saved = flowerpotPathFromRoute(launchNode.route);
        await navi.storage.item.set(SESSION_PWA_LAUNCH, saved);
        return saved;
      }
      return null;
    },

  async loadFlow() {
      if (flow) return flow;
      const override = await navi.storage.item.get(SESSION_FLOW);
      const cfg = await loadProjectConfig();
      const route = override || cfg.flowerpot?.flow_artifact;
      if (!route) throw new Error("config missing flowerpot.flow_artifact");
      const res = await fetchFlowerpot(route);
      flow = JSON.parse(await res.text());
      return flow;
    },

    async setFlowArtifact(route) {
      if (route) {
        await navi.storage.item.set(SESSION_FLOW, route);
      } else {
        await navi.storage.item.del(SESSION_FLOW);
      }
      flow = null;
    },

    async loadDigitColors() {
      if (digitColors) return digitColors;
      const cfg = await loadProjectConfig();
      const route =
        cfg.flowerpot?.digit_colors ||
        "torus/devops/AVHRecordViewer/schema/digit_colors.json";
      const res = await fetchFlowerpot(route);
      const schema = JSON.parse(await res.text());
      digitColors = parseDigitColorsSchema(schema);
      return digitColors;
    },

    getFlow() {
      return flow;
    },

    colorForDigit(digit) {
      const value = digitColors?.[String(digit)];
      if (!value) return "#888";
      if (String(value).startsWith("#")) return value;
      return COLOR_CSS[value] || value;
    },

    colorsForCode(code) {
      return String(code || "")
        .split("")
        .map((d) => this.colorForDigit(d));
    },

    async setSession(code) {
      await navi.storage.item.set(SESSION_PENDING, code);
      await navi.storage.item.set(SESSION_ACTIVE, code);
    },

    async getPendingCode() {
      return (await navi.storage.item.get(SESSION_PENDING)) || "";
    },

    async getActiveCode() {
      return (await navi.storage.item.get(SESSION_ACTIVE)) || "";
    },

    async setActiveDoc(docId) {
      await navi.storage.item.set(SESSION_DOC, docId || "");
    },

    async getActiveDoc() {
      return (await navi.storage.item.get(SESSION_DOC)) || "";
    },

    async getPrefs() {
      const raw = await navi.storage.item.get(SESSION_PREFS);
      return {
        scanPresentation: "sheet",
        virtualEnabled: true,
        parseEnabled: true,
        virtualEditEnabled: true,
        scanPageInline: false,
        virtualPageInline: false,
        ...(raw && typeof raw === "object" ? raw : {}),
      };
    },

    async setPrefs(partial) {
      const next = { ...(await this.getPrefs()), ...partial };
      await navi.storage.item.set(SESSION_PREFS, next);
      return next;
    },

    async setPendingParse(data) {
      if (data) {
        await navi.storage.item.set(SESSION_PARSE, data);
      } else {
        await navi.storage.item.del(SESSION_PARSE);
      }
    },

    async getPendingParse() {
      return (await navi.storage.item.get(SESSION_PARSE)) || null;
    },

    async saveFolderPage(index) {
      await navi.storage.item.set(SESSION_FOLDER_PAGE, index);
    },

    async takeFolderPage() {
      const raw = await navi.storage.item.get(SESSION_FOLDER_PAGE);
      if (raw === null || raw === undefined) return null;
      await navi.storage.item.del(SESSION_FOLDER_PAGE);
      return Number(raw);
    },

    async getSystemSections() {
      if (!flow) await this.loadFlow();
      const sections = flow.meta?.system_sections;
      const base = Array.isArray(sections) && sections.length ? [...sections] : ["clinic"];
      if (!base.includes("capabilities")) base.push("capabilities");
      return base;
    },

    hasLinkedScan(owner, doc) {
      if (!owner || !doc || doc.type !== "virtual") return false;
      const scanId = doc.content?.sourceScanId;
      if (typeof scanId !== "string" || !scanId.trim()) return false;
      return owner.documents.some((d) => d.id === scanId && d.type === "scan");
    },

    linkedScanId(owner, doc) {
      return this.hasLinkedScan(owner, doc) ? String(doc.content.sourceScanId).trim() : null;
    },

    async getVirtualRecordActions() {
      if (!flow) await this.loadFlow();
      const actions = flow.meta?.virtual_record_actions;
      if (Array.isArray(actions) && actions.length) return actions;
      return ["edit", "delete"];
    },

    async canEditVirtual() {
      const prefs = await this.getPrefs();
      if (prefs.virtualEditEnabled === false) return false;
      const actions = await this.getVirtualRecordActions();
      return actions.includes("edit");
    },

    async canDeleteVirtual() {
      const prefs = await this.getPrefs();
      if (prefs.virtualEditEnabled === false) return false;
      const actions = await this.getVirtualRecordActions();
      return actions.includes("delete");
    },

    async openDocEdit() {
      const docId = await this.getActiveDoc();
      if (!docId) throw new Error("no active document");
      return this.go("doc_edit");
    },

    async setSystemReturn(routeKey) {
      await navi.storage.item.set(SESSION_SYSTEM_RETURN, routeKey || "numpad");
    },

    async peekSystemReturn() {
      return (await navi.storage.item.get(SESSION_SYSTEM_RETURN)) || "numpad";
    },

    async takeSystemReturn() {
      const raw = await navi.storage.item.get(SESSION_SYSTEM_RETURN);
      await navi.storage.item.del(SESSION_SYSTEM_RETURN);
      return raw || "numpad";
    },

    async openSystem(returnTo = "numpad") {
      await this.setSystemReturn(returnTo);
      return this.go("system");
    },

    async finishSystem() {
      const returnTo = await this.takeSystemReturn();
      return this.go(returnTo);
    },

    async ensureSystemModule() {
      if (navi.mod.avh_system) return navi.mod.avh_system;
      const cfg = await loadProjectConfig();
      const res = await fetchFlowerpot(
        cfg.flowerpot?.system_module || SYSTEM_MODULE_ROUTE,
        "application/javascript, application/navi-module, text/javascript"
      );
      await navi.mount(await res.text());
      return navi.mod.avh_system;
    },

    systemReturnLabel(routeKey) {
      const labels = {
        numpad: "Back to numpad",
        folder: "Back to folder",
        owners_list: "Back to owners list",
      };
      return labels[routeKey] || "Back";
    },

    // Identity of whatever is actually running — shown in the System header
    // and packaged with feedback. Never hardcoded per variant.
    async describeRuntime() {
      const cfg = await loadProjectConfig();
      if (!flow) await this.loadFlow();
      const program = await this.resolveActiveProgram();
      const launchNode = await resolveLaunchNode(program);
      return {
        project: cfg.project || "avh_record_viewer",
        config_version: cfg.version || null,
        manager_version: MANAGER_VERSION,
        maintainer: MAINTAINER,
        flow_id: flow?.id || null,
        flow_variant: flow?.meta?.variant || null,
        program_id: program?.id || null,
        program_label: program?.label || program?.name || null,
        launch_id: launchNode?.id || null,
        launch_label: launchNode?.label || null,
        launch_route: launchNode?.route || null,
        path: typeof globalThis.location?.pathname === "string" ? globalThis.location.pathname : null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        at: new Date().toISOString(),
      };
    },

    async feedbackEndpoint() {
      const cfg = await loadProjectConfig();
      return cfg.feedback?.endpoint || "";
    },

    async openFeedback(returnTo = "system") {
      await navi.storage.item.set(SESSION_FEEDBACK_RETURN, returnTo || "system");
      return this.go("feedback");
    },

    async finishFeedback() {
      const raw = await navi.storage.item.get(SESSION_FEEDBACK_RETURN);
      await navi.storage.item.del(SESSION_FEEDBACK_RETURN);
      return this.go(raw || "system");
    },

    filterDocs(owner, virtualEnabled = true) {
      if (!owner?.documents) return [];
      return virtualEnabled !== false
        ? owner.documents
        : owner.documents.filter((d) => d.type === "scan");
    },

    groupDocsByPet(owner, virtualEnabled = true) {
      const docs = this.filterDocs(owner, virtualEnabled);
      const general = docs.filter((d) => !d.petId);
      const sections = (owner.pets || [])
        .map((pet) => ({
          pet,
          docs: docs.filter((d) => d.petId === pet.id),
        }))
        .filter((s) => s.docs.length > 0);
      return { general, sections };
    },

    scanPageIndex(owner, scanId, virtualEnabled = true) {
      if (!owner) return null;
      let idx = 0;
      const virtuals =
        virtualEnabled !== false ? owner.documents.filter((x) => x.type === "virtual") : [];
      const scans = owner.documents.filter((x) => x.type === "scan");
      idx += 1;
      idx += virtuals.length;
      for (const s of scans) {
        if (s.id === scanId) return idx;
        idx += 1;
      }
      return null;
    },

    async ensureOcrModule() {
      if (navi.mod.avh_ocr) return navi.mod.avh_ocr;
      const res = await fetchFlowerpot(
        OCR_MODULE_ROUTE,
        "application/javascript, application/navi-module, text/javascript"
      );
      await navi.mount(await res.text());
      const mod = navi.mod.avh_ocr;
      if (!mod?.ocr) throw new Error("OCR module failed to register");
      return mod;
    },

    isOcrReady() {
      const st = navi.mod.avh_ocr?.ocr?.getStatus?.();
      return st?.state === "ready";
    },

    async ensureParseModule() {
      if (navi.mod.avh_parse) return navi.mod.avh_parse;
      const res = await fetchFlowerpot(
        PARSE_MODULE_ROUTE,
        "application/javascript, application/navi-module, text/javascript"
      );
      await navi.mount(await res.text());
      const mod = navi.mod.avh_parse;
      if (!mod?.parse) throw new Error("Parse module failed to register");
      return mod;
    },

    async ensureVirtualViewModule() {
      if (navi.mod.avh_virtual_view) return navi.mod.avh_virtual_view;
      const res = await fetchFlowerpot(
        VIRTUAL_VIEW_MODULE_ROUTE,
        "application/javascript, application/navi-module, text/javascript"
      );
      await navi.mount(await res.text());
      const mod = navi.mod.avh_virtual_view;
      if (!mod?.virtualView) throw new Error("Virtual view module failed to register");
      return mod;
    },

    async openLinkedScan(scanId) {
      if (!flow) await this.loadFlow();
      const code = await this.getActiveCode();
      if (!code) return this.openScan(scanId);
      const registry = await ensureRegistry();
      const owner = await registry.getOwner(code);
      const prefs = await this.getPrefs();
      if (
        (flow.meta?.layout === "page_turn" || flow.meta?.variant === "folder_scan_pages") &&
        owner
      ) {
        const idx = this.scanPageIndex(owner, scanId, prefs.virtualEnabled);
        if (idx !== null) {
          await this.saveFolderPage(idx);
          return this.go("folder");
        }
      }
      return this.openScan(scanId);
    },

    async scanPresentationMode() {
      if (!flow) await this.loadFlow();
      const prefs = await this.getPrefs();
      return prefs.scanPresentation || flow.meta?.scan_presentation || "sheet";
    },

    async openScanView(docId, showOverlay) {
      await this.setActiveDoc(docId);
      const mode = await this.scanPresentationMode();
      if (mode === "overlay" && typeof showOverlay === "function") {
        return showOverlay(docId);
      }
      return this.go("scan_sheet");
    },

    async openScan(docId) {
      return this.openScanView(docId, null);
    },

    async openDoc(docId) {
      await this.setActiveDoc(docId);
      return this.go("doc_sheet");
    },

    async openOwner(code) {
      const registry = await ensureRegistry();
      registry.validateCode(code);
      await this.setSession(code);
      if (!flow) await this.loadFlow();
      return this.go("folder");
    },

    async go(routeKey) {
      if (!flow) await this.loadFlow();
      const url = flow.routes?.[routeKey];
      if (!url) throw new Error(`unknown route: ${routeKey}`);
      await ensureSurf()(url);
      return url;
    },

    async submitCode(code) {
      const registry = await ensureRegistry();
      registry.validateCode(code);
      await this.setSession(code);
      if (!flow) await this.loadFlow();
      const owner = await registry.lookup(code);
      const branch = owner
        ? flow.policy.lookup.found
        : flow.policy.lookup.missing;
      return this.go(branch);
    },

    async openDocAdd(options = {}) {
      await navi.storage.item.set(SESSION_DOC_ADD_PET, options.petId || "");
      return this.go("doc_add");
    },

    async peekDocAddPet() {
      return (await navi.storage.item.get(SESSION_DOC_ADD_PET)) || "";
    },

    async takeDocAddPet() {
      const raw = await navi.storage.item.get(SESSION_DOC_ADD_PET);
      await navi.storage.item.del(SESSION_DOC_ADD_PET);
      return raw || "";
    },

    async chooseDocKind(kind) {
      const petId = await this.takeDocAddPet();
      const code = await this.getActiveCode();
      if (!code) throw new Error("no active folder");
      const registry = await ensureRegistry();

      if (kind === "capture") {
        await this.setFilingPet(petId);
        return this.go("capture");
      }
      if (kind === "pet_details") {
        if (!petId) throw new Error("Pet details requires a pet context");
        return this.openPetDetailsDoc(petId);
      }
      if (kind === "general") {
        const doc = await registry.createVirtualRecord(code, {
          petId: petId || undefined,
          title: "Untitled record",
          content: { notes: "" },
        });
        await this.setActiveDoc(doc.id);
        return this.go("doc_edit");
      }
      throw new Error(`Unknown document kind: ${kind}`);
    },

    async openPetAdd() {
      return this.go("pet_add");
    },

    async setFilingPet(petId) {
      await navi.storage.item.set(SESSION_FILING_PET, petId || "");
    },

    async takeFilingPet() {
      const raw = await navi.storage.item.get(SESSION_FILING_PET);
      await navi.storage.item.del(SESSION_FILING_PET);
      return raw || "";
    },

    async peekFilingPet() {
      return (await navi.storage.item.get(SESSION_FILING_PET)) || "";
    },

    async openCapture(options = {}) {
      if (options.petId !== undefined) {
        await this.setFilingPet(options.petId || "");
      }
      return this.go("capture");
    },

    async openPetDetailsDoc(petId) {
      const registry = await ensureRegistry();
      const code = await this.getActiveCode();
      if (!code) throw new Error("no active folder");
      const owner = await registry.getOwner(code);
      let doc = petDetailsDocFromOwner(owner, petId);
      if (!doc) {
        doc = await registry.createPetDetailsDoc(code, petId);
      }
      await this.setActiveDoc(doc.id);
      return this.go("doc_sheet");
    },

    async createOwner(ownerName, pets) {
      const registry = await ensureRegistry();
      const code = await this.getPendingCode();
      if (!code) throw new Error("no pending code in session");
      const owner = await registry.create(code, ownerName, pets);
      await this.setSession(owner.code);
      if (!flow) await this.loadFlow();
      return this.go(flow.policy.create.success);
    },

    async bootstrap() {
      await this.savePwaLaunchContext();
      await this.loadFlow();
      await this.loadDigitColors();
      const program = await this.resolveActiveProgram();
      if (program?.id) {
        await navi.storage.item.set(SESSION_PROGRAM, program.id);
      }
      await this.applyProgramPwa();
      const url = await this.go(flow.entry);
      await this.applyProgramPwa();
      return url;
    },
  };

  return {
    name: "avh_manager",
    version: MANAGER_VERSION,
    description: "AVHhosp flow Manager — surf navigation (L4)",

    moduleInfo: {
      name: "avh_manager",
      version: MANAGER_VERSION,
      description: "AVHhosp flow Manager — surf navigation (L4)",
    },

    manager,
    loadProjectConfig,
    flowerpotUrl,

    onMount: async () => {
      navi.callout("[avh_manager] L4 manager ready");
    },
  };
};
