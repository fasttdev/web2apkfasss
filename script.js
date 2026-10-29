(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  let toastTimer = null;
  let building = false;

  function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }

  function toast(message, type) {
    const element = $("#toast");
    if (!element) return;
    element.textContent = message;
    element.dataset.type = type || 'info';
    element.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { element.classList.remove("show"); }, 3500);
  }

  function getTodayDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getBuildLimit(plan) {
    if (plan === 'promax') return Infinity;
    if (plan === 'pro') return 5;
    return 3;
  }

  function getBuildData() {
    const today = getTodayDateString();
    let data = { date: today, count: 0 };
    try {
      const saved = localStorage.getItem('web2apk:build-count:v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.date === today) data = parsed;
      }
    } catch (e) {}
    return data;
  }

  function updateLimitUI(serverCount) {
    const plan = (window.currentProfile?.role || 'free').toLowerCase();
    const limit = getBuildLimit(plan);
    const local = getBuildData();
    const count = (typeof serverCount === 'number') ? serverCount : local.count;

    const limitTextEl = $("#limitText");
    const limitChipEl = $("#limitChip");
    if (!limitTextEl) return;

    if (limit === Infinity) {
      limitTextEl.textContent = "UNLIMITED";
      if (limitChipEl) {
        limitChipEl.style.borderColor = "rgba(105, 228, 177, 0.3)";
        limitChipEl.style.color = "#a0e8ca";
      }
    } else {
      const remaining = Math.max(0, limit - count);
      if (remaining === 0) {
        limitTextEl.textContent = `HABIS (0/${limit})`;
        if (limitChipEl) {
          limitChipEl.style.borderColor = "rgba(255, 110, 110, 0.4)";
          limitChipEl.style.color = "#ff9e9e";
        }
      } else {
        limitTextEl.textContent = `SISA: ${remaining}/${limit}`;
        if (limitChipEl) {
          limitChipEl.style.borderColor = "rgba(160, 177, 219, .13)";
          limitChipEl.style.color = "#a0e8ca";
        }
      }
    }
  }

  function setSource(type) {
    const isUrl = type === "url";
    $("#sourceType").value = type;
    $("#urlField").classList.toggle("hidden", !isUrl);
    $("#htmlField").classList.toggle("hidden", isUrl);
    $("#websiteUrl").required = isUrl;
    $("#htmlFile").required = !isUrl;
    $$("[data-source]").forEach((button) => {
      button.classList.toggle("active", button.dataset.source === type);
    });
  }

  function setOrientation(value) {
    $("#orientation").value = value;
    $$("[data-orientation]").forEach((button) => {
      button.classList.toggle("active", button.dataset.orientation === value);
    });
  }

  function setSplashFields() {
    const selected = $('input[name="splashType"]:checked')?.value || "default";
    $("#splashImageField").classList.toggle("hidden", selected !== "image");
    $("#splashHtmlField").classList.toggle("hidden", selected !== "html");
    $("#splashVideoField").classList.toggle("hidden", selected !== "video");
    $("#splashImage").required = false;
    $("#splashHtml").required = selected === "html";
    $("#splashVideo").required = false;
    $$(".choice").forEach((choice) => {
      const radio = choice.querySelector('input[type="radio"]');
      choice.classList.toggle("selected", Boolean(radio?.checked));
    });
  }

  function bindFileLabel(inputSelector, labelSelector, emptyText) {
    const input = $(inputSelector);
    const label = $(labelSelector);
    if (!input || !label) return;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      label.textContent = file ? file.name : emptyText;
    });
  }

  function setProgress(percent, title, message, status) {
    const safePercent = Math.max(0, Math.min(100, percent));
    $("#progressTitle").textContent = title;
    $("#progressMessage").textContent = message;
    $("#progressBar").style.width = `${safePercent}%`;
    $("#progressPercent").textContent = `${safePercent}%`;
    $("#progressStatus").textContent = status;
  }

  function showResult(title, message, downloadUrl) {
    const card = $("#resultCard");
    const link = $("#downloadLink");
    $("#resultTitle").textContent = title;
    $("#resultMessage").textContent = message;
    card.classList.remove("hidden");
    if (downloadUrl) {
      link.href = downloadUrl;
      link.classList.remove("hidden");
    } else {
      link.removeAttribute("href");
      link.classList.add("hidden");
    }
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    refreshIcons();
  }

  function getDownloadUrl(data) {
    if (!data || typeof data !== "object") return null;
    const candidates = [data.downloadUrl, data.download_url, data.apkUrl, data.apk_url, data.url, data.download?.url, data.data?.downloadUrl, data.data?.download_url];
    return candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value.trim()))?.trim() || null;
  }

  function getServerMessage(data, fallback) {
    if (typeof data === "string" && data.trim()) return data.trim();
    if (data && typeof data === "object") {
      const candidates = [data.error, data.message, data.detail, data.data?.error, data.data?.message];
      const message = candidates.find((value) => typeof value === "string" && value.trim());
      if (message) return message.trim();
    }
    return fallback;
  }

  function getBuildFormData(form) {
    const formData = new FormData(form);
    const sourceType = $("#sourceType").value;
    const websiteUrl = $("#websiteUrl").value.trim();
    const htmlInput = $("#htmlFile");
    const htmlFile = htmlInput.files?.[0];

    formData.delete("websiteUrl"); formData.delete("url"); formData.delete("htmlFile"); formData.delete("html"); formData.delete("sourceType");

    if (sourceType === "url") formData.append("url", websiteUrl);
    else if (sourceType === "file") {
      if (!htmlFile) throw new Error("Pilih file HTML terlebih dahulu.");
      formData.append("html", htmlFile, htmlFile.name);
    } else throw new Error("Pilih sumber aplikasi yang valid.");

    const splashType = $('input[name="splashType"]:checked')?.value || "default";
    formData.delete("splashImage"); formData.delete("splashVideo");
    if (splashType !== "html") formData.delete("splashHtml");

    if (splashType === "image") {
      const file = $("#splashImage").files?.[0];
      if (!file) throw new Error("Pilih gambar untuk splash screen.");
      formData.append("splashImage", file, file.name);
    }
    if (splashType === "video") {
      const file = $("#splashVideo").files?.[0];
      if (!file) throw new Error("Pilih video untuk splash screen.");
      formData.append("splashVideo", file, file.name);
    }
    if (splashType === "html") {
      const html = $("#splashHtml").value.trim();
      if (!html) throw new Error("Isi kode HTML untuk splash screen.");
      formData.set("splashHtml", html);
    }
    return formData;
  }

  $$("[data-source]").forEach((button) => button.addEventListener("click", () => setSource(button.dataset.source)));
  $$("[data-orientation]").forEach((button) => button.addEventListener("click", () => setOrientation(button.dataset.orientation)));
  $$('input[name="splashType"]').forEach((radio) => radio.addEventListener("change", setSplashFields));

  bindFileLabel("#htmlFile", "#htmlFileName", "Belum ada file dipilih");
  bindFileLabel("#zipFile", "#zipFileName", "Asset website (jika diperlukan)");
  bindFileLabel("#iconFile", "#iconFileName", "PNG atau JPG");

  const helpModal = $("#helpModal");
  $("#helpBtn")?.addEventListener("click", () => helpModal?.classList.remove("hidden"));
  function closeHelp() { helpModal?.classList.add("hidden"); }
  $("#closeHelp")?.addEventListener("click", closeHelp);
  $("#closeHelpBottom")?.addEventListener("click", closeHelp);
  helpModal?.addEventListener("click", (event) => { if (event.target === helpModal) closeHelp(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeHelp(); });

  window.addEventListener('authready', () => updateLimitUI());
  window.addEventListener('authprofile', () => updateLimitUI());

  $("#buildForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (building) return;

    const form = event.currentTarget;
    const button = $("#buildButton");
    const progress = $("#progressCard");
    const result = $("#resultCard");
    const log = $("#buildLog");

    if (!form.reportValidity()) return;

    const sourceType = $("#sourceType").value;
    const packageName = $("#packageName").value.trim();
    const appName = $("#appName").value.trim();
    const websiteUrl = $("#websiteUrl").value.trim();
    const htmlFile = $("#htmlFile").files?.[0];

    if (!appName) { toast("Nama aplikasi wajib diisi.", "error"); $("#appName").focus(); return; }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName)) { toast("Package name tidak valid.", "error"); $("#packageName").focus(); return; }

    if (sourceType === "url") {
      try {
        const parsedUrl = new URL(websiteUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol) || !parsedUrl.hostname.includes(".")) throw new Error("URL tidak valid.");
      } catch { toast("Masukkan URL website lengkap.", "error"); $("#websiteUrl").focus(); return; }
    } else if (sourceType === "file") {
      if (!htmlFile) { toast("Pilih file HTML terlebih dahulu.", "error"); $("#htmlFile").click(); return; }
      if (!/\.(html?|HTML?)$/.test(htmlFile.name)) { toast("File harus .html atau .htm.", "error"); return; }
    }

    const versionCode = Number($("#versionCode").value);
    if (!Number.isInteger(versionCode) || versionCode < 1) { toast("Version code minimal 1.", "error"); $("#versionCode").focus(); return; }

    const zipFile = $("#zipFile").files?.[0];
    if (zipFile && !/\.zip$/i.test(zipFile.name)) { toast("File tambahan harus ZIP.", "error"); return; }

    const iconFile = $("#iconFile").files?.[0];
    if (iconFile && !/\.(png|jpe?g|webp)$/i.test(iconFile.name)) { toast("Ikon harus PNG, JPG, atau WebP.", "error"); return; }

    let formData;
    try { formData = getBuildFormData(form); } catch (error) { toast(error.message || "Konfigurasi belum lengkap.", "error"); return; }

    if (!window.firebaseAuth || !window.firebaseAuth.currentUser) {
      toast("Sesi login tidak ditemukan. Login ulang.", "error");
      setTimeout(() => window.location.replace('login.html'), 1500);
      return;
    }

    building = true;
    button.disabled = true;
    progress.classList.remove("hidden");
    result.classList.add("hidden");
    $("#downloadLink").classList.add("hidden");
    log.classList.add("hidden");
    log.textContent = "";

    setProgress(10, "Menyiapkan build...", "Memvalidasi konfigurasi aplikasi.", "Menyiapkan");

    try {
      setProgress(25, "Mengirim konfigurasi...", "Menghubungi server Build APK.", "Mengirim");

      const response = await window.apiFetch("/api/build", {
        method: "POST",
        body: formData
      });

      const contentType = response.headers.get("content-type") || "";
      let data;
      if (contentType.includes("application/json")) data = await response.json();
      else data = await response.text();

      if (response.status === 401) {
        setProgress(100, "Build gagal", "Sesi tidak valid. Login ulang.", "Gagal");
        log.textContent = "Sesi login tidak valid atau expired.";
        log.classList.remove("hidden");
        showResult("Build gagal", "Sesi tidak valid. Login ulang.", null);
        toast("Sesi tidak valid.", "error");
        building = false; button.disabled = false; refreshIcons();
        setTimeout(() => window.location.replace('login.html'), 2000);
        return;
      }

      if (response.status === 429) {
        const limitMsg = getServerMessage(data, "Limit build harian tercapai.");
        setProgress(100, "Limit tercapai", limitMsg, "Gagal");
        log.textContent = limitMsg;
        log.classList.remove("hidden");
        showResult("Limit tercapai", limitMsg, null);
        toast(limitMsg, "warn");
        return;
      }

      if (!response.ok) throw new Error(getServerMessage(data, `Build gagal (HTTP ${response.status}).`));
      if (data && typeof data === "object" && (data.success === false || data.error)) throw new Error(getServerMessage(data, "Server melaporkan build gagal."));

      setProgress(80, "Memeriksa hasil build...", "Respons server berhasil diterima.", "Memeriksa");

      const downloadUrl = getDownloadUrl(data);
      const message = getServerMessage(data, downloadUrl ? "APK berhasil dibuat dan siap diunduh." : "URL unduhan tidak ditemukan.");

      if (!downloadUrl) throw new Error(message);

      if (data && typeof data._count === 'number') {
        try {
          localStorage.setItem('web2apk:build-count:v1', JSON.stringify({ date: getTodayDateString(), count: data._count }));
        } catch (e) {}
        updateLimitUI(data._count);
      } else {
        const buildData = getBuildData();
        buildData.count += 1;
        try { localStorage.setItem('web2apk:build-count:v1', JSON.stringify(buildData)); } catch (e) {}
        updateLimitUI();
      }

      const creator = window.currentProfile?.username || window.currentUser?.email || 'Unknown';
      window.apiFetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'build',
          data: { sourceType, sourceUrl: websiteUrl, appName, creator, packageName }
        })
      }).catch(() => {});

      setProgress(100, "Build selesai!", "APK siap diunduh.", "Selesai");
      showResult("Build berhasil!", message, downloadUrl);
      toast("APK berhasil dibuat.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
      setProgress(100, "Build gagal", "Periksa pesan error di bawah.", "Gagal");
      log.textContent = message;
      log.classList.remove("hidden");
      showResult("Build gagal", message, null);
      toast("Build gagal. Periksa pesan error.", "error");
    } finally {
      building = false;
      button.disabled = false;
      refreshIcons();
    }
  });

  setSource("url");
  setOrientation("portrait");
  setSplashFields();
  refreshIcons();
})();