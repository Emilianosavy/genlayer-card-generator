// GenLayer Community Card Generator
// Poem generation is proxied through serverless backend calls to keep API keys private

const uploadZone = document.getElementById("upload-zone");
const uploadInner = document.getElementById("upload-inner");
const pfpInput = document.getElementById("pfp-input");
const pfpPreview = document.getElementById("pfp-preview");
const nameInput = document.getElementById("name-input");
const thoughtsInput = document.getElementById("thoughts-input");
const charCount = document.getElementById("char-count");
const generateBtn = document.getElementById("generate-btn");
const quotaCount = document.getElementById("quota-count");
const quotaFill = document.getElementById("quota-fill");
const quotaText = document.getElementById("quota-text");
const formSection = document.getElementById("form-section");
const outputSection = document.getElementById("output-section");
const cardPfp = document.getElementById("card-pfp");
const cardName = document.getElementById("card-name");
const cardRawQuote = document.getElementById("card-raw-quote");
const cardPoem = document.getElementById("card-poem");
const downloadBtn = document.getElementById("download-btn");
const shareBtn = document.getElementById("share-btn");
const resetBtn = document.getElementById("reset-btn");

let pfpDataUrl = null;
let dailyQuota = {
  limit: 2,
  current: 0,
  message:
    "Your quota resets every day. Once you reach 2 generated cards, you’ll need to wait until the next UTC day.",
};

updateQuotaCard(dailyQuota);
void loadQuotaStatus();

// ─── Upload pfp ────────────────────────────────────────────────────────────
uploadZone.addEventListener("click", () => pfpInput.click());
uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.style.borderColor = "var(--green)";
  uploadZone.style.background = "var(--green-dim)";
});
uploadZone.addEventListener("dragleave", () => {
  uploadZone.style.borderColor = "";
  uploadZone.style.background = "";
});
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.style.borderColor = "";
  uploadZone.style.background = "";
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) loadPfp(file);
});
pfpInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) loadPfp(file);
});

function loadPfp(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    pfpDataUrl = e.target.result;
    pfpPreview.src = pfpDataUrl;
    pfpPreview.classList.remove("hidden");
    uploadInner.classList.add("hidden");
    uploadZone.classList.add("has-image");
  };
  reader.readAsDataURL(file);
}

// ─── Char count ────────────────────────────────────────────────────────────
thoughtsInput.addEventListener("input", () => {
  charCount.textContent = thoughtsInput.value.length;
});

// ─── Generate ──────────────────────────────────────────────────────────────
generateBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const thoughts = thoughtsInput.value.trim();

  // Validation
  if (!pfpDataUrl) return showToast("Please upload a profile picture first");
  if (!name) return showToast("Please enter your name or handle");
  if (!thoughts || thoughts.length < 10)
    return showToast(
      "Please share a bit more about what you love about GenLayer",
    );

  // Loading state
  generateBtn.disabled = true;
  generateBtn.classList.add("loading");
  generateBtn.querySelector(".btn-text").textContent = "Generating your card";
  generateBtn.querySelector(".btn-icon").style.display = "none";

  try {
    const result = await generatePoem(thoughts, name);
    updateQuotaCard(result.quota || dailyQuota);
    const poem = result.poem;
    buildCard(name, thoughts, poem);
    formSection.classList.add("hidden");
    outputSection.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error(err);
    showToast(
      err.message || "Something went wrong while generating your card.",
    );
  } finally {
    generateBtn.disabled = false;
    generateBtn.classList.remove("loading");
    generateBtn.querySelector(".btn-text").textContent = "Generate my card";
    generateBtn.querySelector(".btn-icon").style.display = "";
  }
});

// ─── Backend API call ───────────────────────────────────────────────────────
async function generatePoem(thoughts, name) {
  const response = await fetch("/api/generate-poem", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ thoughts, name }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 400)
      throw new Error(
        "Please enter your name and a longer message to continue.",
      );
    if (response.status === 503)
      throw new Error("Gemini is not configured on the server.");
    if (response.status === 429)
      updateQuotaCard({
        limit: Number(err.limit || dailyQuota.limit || 2),
        current: Number(err.current || dailyQuota.current || 0),
        message: err.error || err.message,
      });
    if (response.status === 429)
      throw new Error(
        err.error ||
          err.message ||
          "Daily quota reached. You can generate 2 cards per IP per day. Please try again after midnight UTC.",
      );
    throw new Error(err.error || err.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return {
    poem:
      data.poem || "Where intelligence meets trust, a new world is written.",
    quota: data.quota,
  };
}

async function loadQuotaStatus() {
  try {
    const response = await fetch("/api/generate-poem", { method: "GET" });
    if (!response.ok) {
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (data?.quota) {
      updateQuotaCard(data.quota);
    }
  } catch (_error) {
    // Keep default quota card when status endpoint is unavailable.
  }
}

function updateQuotaCard(quota) {
  const limit = Number(quota?.limit || 2);
  const current = Math.max(0, Number(quota?.current || 0));
  const remaining = Math.max(0, limit - current);
  const progress = Math.min(100, Math.round((current / limit) * 100));

  dailyQuota = {
    limit,
    current,
    remaining,
    message: quota?.message || dailyQuota.message,
  };

  if (quotaCount) {
    quotaCount.textContent = `${current} / ${limit} used`;
  }

  if (quotaFill) {
    quotaFill.style.width = `${progress}%`;
  }

  if (quotaText) {
    if (remaining > 0) {
      quotaText.textContent = `You have ${remaining} card${remaining === 1 ? "" : "s"} left today. The limit resets at midnight UTC.`;
    } else {
      quotaText.textContent = quota?.message || dailyQuota.message;
    }
  }
}

// ─── Build card ─────────────────────────────────────────────────────────────
function buildCard(name, thoughts, poem) {
  cardPfp.src = pfpDataUrl;
  cardName.textContent = name;

  // Truncate raw quote for the card
  const truncated =
    thoughts.length > 100 ? thoughts.slice(0, 97) + "…" : thoughts;
  cardRawQuote.textContent = truncated;

  cardPoem.textContent = poem;
}

// ─── Download ───────────────────────────────────────────────────────────────
downloadBtn.addEventListener("click", async () => {
  downloadBtn.textContent = "Preparing...";
  downloadBtn.disabled = true;

  try {
    const card = document.getElementById("gen-card");
    const canvas = await html2canvas(card, {
      scale: 3,
      backgroundColor: "#0A0A0F",
      useCORS: true,
      logging: false,
      allowTaint: true,
    });

    const link = document.createElement("a");
    link.download = `genlayer-card-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    console.error(err);
    showToast(
      "Download failed. Try right-clicking the card and saving the image.",
    );
  } finally {
    downloadBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3V11M9 11L5.5 7.5M9 11L12.5 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 13V14C3 14.552 3.448 15 4 15H14C14.552 15 15 14.552 15 14V13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg> Download card`;
    downloadBtn.disabled = false;
  }
});

// ─── Share to X ──────────────────────────────────────────────────────────────
shareBtn.addEventListener("click", () => {
  const poem = cardPoem.textContent;
  const name = cardName.textContent;
  const tweet = encodeURIComponent(
    `Just generated my GenLayer Community Card 🧠⛓️\n\n"${poem}"\n\n— ${name}\n\nBuild yours → genlayer.com\n\n#GenLayer #IntelligentBlockchain #Web3`,
  );
  window.open(`https://twitter.com/intent/tweet?text=${tweet}`, "_blank");
});

// ─── Reset ───────────────────────────────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  outputSection.classList.add("hidden");
  formSection.classList.remove("hidden");
  pfpDataUrl = null;
  pfpPreview.classList.add("hidden");
  uploadInner.classList.remove("hidden");
  uploadZone.classList.remove("has-image");
  nameInput.value = "";
  thoughtsInput.value = "";
  charCount.textContent = "0";
  pfpInput.value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ─── Toast ───────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast hidden";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add("hidden"), 4000);
}
