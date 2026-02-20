const fs = require('fs/promises');
const path = require('path');

const reviewsPath = path.join(__dirname, 'weekly_reviews.json');

async function ensureFile() {
  try {
    await fs.access(reviewsPath);
  } catch (_error) {
    await fs.writeFile(reviewsPath, '[]', 'utf-8');
  }
}

async function readReviews() {
  await ensureFile();
  const content = await fs.readFile(reviewsPath, 'utf-8');
  try {
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch (_error) {
    return [];
  }
}

async function writeReviews(items) {
  await fs.writeFile(reviewsPath, JSON.stringify(items, null, 2), 'utf-8');
}

function buildReviewId(items) {
  const maxId = items.reduce((acc, item) => {
    const id = Number(item.id);
    return Number.isInteger(id) ? Math.max(acc, id) : acc;
  }, 0);
  return maxId + 1;
}

async function listWeeklyReviews() {
  const items = await readReviews();
  return items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function createWeeklyReview(payload) {
  const items = await readReviews();
  const review = {
    id: buildReviewId(items),
    created_at: new Date().toISOString(),
    respostas: {
      executei: String(payload?.respostas?.executei || '').trim(),
      trouxe_paz: String(payload?.respostas?.trouxe_paz || '').trim(),
      gerou_peso: String(payload?.respostas?.gerou_peso || '').trim(),
      deve_sair: String(payload?.respostas?.deve_sair || '').trim()
    },
    insights: payload?.insights || ''
  };

  items.push(review);
  await writeReviews(items);
  return review;
}

module.exports = {
  listWeeklyReviews,
  createWeeklyReview
};
