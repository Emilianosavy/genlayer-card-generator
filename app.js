// GenLayer Community Card Generator
// All processing happens in the browser — no server, no data stored

const uploadZone = document.getElementById('upload-zone');
const uploadInner = document.getElementById('upload-inner');
const pfpInput = document.getElementById('pfp-input');
const pfpPreview = document.getElementById('pfp-preview');
const nameInput = document.getElementById('name-input');
const thoughtsInput = document.getElementById('thoughts-input');
const charCount = document.getElementById('char-count');
const apiKeyInput = document.getElementById('api-key-input');
const generateBtn = document.getElementById('generate-btn');
const formSection = document.getElementById('form-section');
const outputSection = document.getElementById('output-section');
const cardPfp = document.getElementById('card-pfp');
const cardName = document.getElementById('card-name');
const cardRawQuote = document.getElementById('card-raw-quote');
const cardPoem = document.getElementById('card-poem');
const downloadBtn = document.getElementById('download-btn');
const shareBtn = document.getElementById('share-btn');
const resetBtn = document.getElementById('reset-btn');

let pfpDataUrl = null;

// ─── Upload pfp ────────────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => pfpInput.click());
uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.style.borderColor = 'var(--green)';
  uploadZone.style.background = 'var(--green-dim)';
});
uploadZone.addEventListener('dragleave', () => {
  uploadZone.style.borderColor = '';
  uploadZone.style.background = '';
});
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.style.borderColor = '';
  uploadZone.style.background = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadPfp(file);
});
pfpInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadPfp(file);
});

function loadPfp(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    pfpDataUrl = e.target.result;
    pfpPreview.src = pfpDataUrl;
    pfpPreview.classList.remove('hidden');
    uploadInner.classList.add('hidden');
    uploadZone.classList.add('has-image');
  };
  reader.readAsDataURL(file);
}

// ─── Char count ────────────────────────────────────────────────────────────
thoughtsInput.addEventListener('input', () => {
  charCount.textContent = thoughtsInput.value.length;
});

// ─── Generate ──────────────────────────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
  const name = nameInput.value.trim();
  const thoughts = thoughtsInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  // Validation
  if (!pfpDataUrl) return showToast('Please upload a profile picture first');
  if (!name) return showToast('Please enter your name or handle');
  if (!thoughts || thoughts.length < 10) return showToast('Please share a bit more about what you love about GenLayer');
  if (!apiKey || !apiKey.startsWith('sk-ant-')) return showToast('Please enter a valid Anthropic API key (starts with sk-ant-)');

  // Loading state
  generateBtn.disabled = true;
  generateBtn.classList.add('loading');
  generateBtn.querySelector('.btn-text').textContent = 'Generating your card';
  generateBtn.querySelector('.btn-icon').style.display = 'none';

  try {
    const poem = await generatePoem(thoughts, name, apiKey);
    buildCard(name, thoughts, poem);
    formSection.classList.add('hidden');
    outputSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Something went wrong. Check your API key and try again.');
  } finally {
    generateBtn.disabled = false;
    generateBtn.classList.remove('loading');
    generateBtn.querySelector('.btn-text').textContent = 'Generate my card';
    generateBtn.querySelector('.btn-icon').style.display = '';
  }
});

// ─── Claude API call ────────────────────────────────────────────────────────
async function generatePoem(thoughts, name, apiKey) {
  const prompts = [
    `You are a poet and philosopher writing for the GenLayer blockchain community — a project building the world's first intelligent blockchain where AI and smart contracts merge to create trustless decision-making.

A community member named "${name}" shared this about GenLayer:
"${thoughts}"

Write a SHORT, poetic 2-3 line statement (maximum 40 words) that:
- Captures the essence of their perspective in beautiful, evocative language
- References the spirit of GenLayer (intelligence, trust, the future, decentralized minds, contracts that think)
- Feels personal yet universal — like a mantra or a vision
- Has a slightly mysterious, forward-looking tone
- Does NOT use clichés like "unleashing potential" or "changing the world"

Reply with ONLY the poetic statement. No quotes, no attribution, no explanation.`,
  ];

  const prompt = prompts[Math.floor(Math.random() * prompts.length)];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Invalid API key. Please check and try again.');
    if (response.status === 429) throw new Error('Rate limit hit. Please wait a moment and try again.');
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text?.trim() || 'Where intelligence meets trust, a new world is written.';
}

// ─── Build card ─────────────────────────────────────────────────────────────
function buildCard(name, thoughts, poem) {
  cardPfp.src = pfpDataUrl;
  cardName.textContent = name;

  // Truncate raw quote for the card
  const truncated = thoughts.length > 100 ? thoughts.slice(0, 97) + '…' : thoughts;
  cardRawQuote.textContent = truncated;

  cardPoem.textContent = poem;
}

// ─── Download ───────────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', async () => {
  downloadBtn.textContent = 'Preparing...';
  downloadBtn.disabled = true;

  try {
    const card = document.getElementById('gen-card');
    const canvas = await html2canvas(card, {
      scale: 3,
      backgroundColor: '#0A0A0F',
      useCORS: true,
      logging: false,
      allowTaint: true,
    });

    const link = document.createElement('a');
    link.download = `genlayer-card-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error(err);
    showToast('Download failed. Try right-clicking the card and saving the image.');
  } finally {
    downloadBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 3V11M9 11L5.5 7.5M9 11L12.5 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 13V14C3 14.552 3.448 15 4 15H14C14.552 15 15 14.552 15 14V13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg> Download card`;
    downloadBtn.disabled = false;
  }
});

// ─── Share to X ──────────────────────────────────────────────────────────────
shareBtn.addEventListener('click', () => {
  const poem = cardPoem.textContent;
  const name = cardName.textContent;
  const tweet = encodeURIComponent(
    `Just generated my GenLayer Community Card 🧠⛓️\n\n"${poem}"\n\n— ${name}\n\nBuild yours → genlayer.com\n\n#GenLayer #IntelligentBlockchain #Web3`
  );
  window.open(`https://twitter.com/intent/tweet?text=${tweet}`, '_blank');
});

// ─── Reset ───────────────────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  outputSection.classList.add('hidden');
  formSection.classList.remove('hidden');
  pfpDataUrl = null;
  pfpPreview.classList.add('hidden');
  uploadInner.classList.remove('hidden');
  uploadZone.classList.remove('has-image');
  nameInput.value = '';
  thoughtsInput.value = '';
  charCount.textContent = '0';
  pfpInput.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ─── Toast ───────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast hidden';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 4000);
}
