import prisma from '../../db/prisma.js';

const MAX_RESULTS = 50;
function cached(res, seconds = 3600) { res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds}`); }
function code(value, field) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,32}$/.test(value)) throw Object.assign(new Error(`Invalid ${field}.`), { statusCode: 400 });
  return value;
}

export async function listProvinces(req, res) {
  const provinces = await prisma.province.findMany({ orderBy: { name: 'asc' } });
  cached(res, 86_400);
  res.json({ success: true, data: provinces });
}

export async function listMunicipalities(req, res) {
  const { provinceCode } = req.query;
  if (!provinceCode) {
    return res.status(400).json({ success: false, error: 'provinceCode query parameter is required.' });
  }
  const municipalities = await prisma.municipality.findMany({
    where: { provinceCode: code(provinceCode, 'provinceCode') },
    orderBy: { name: 'asc' },
  });
  cached(res); res.json({ success: true, data: municipalities });
}

export async function searchBarangays(req, res) {
  const { municipalityCode, q } = req.query;
  if (!municipalityCode) {
    return res.status(400).json({ success: false, error: 'municipalityCode query parameter is required.' });
  }
  if (q !== undefined && q !== '' && (typeof q !== 'string' || q.trim().length > 80)) {
    return res.status(400).json({ success: false, error: 'Search query must be at most 80 characters.' });
  }
  const where = { municipalityCode: code(municipalityCode, 'municipalityCode') };
  if (q && q.trim()) {
    where.name = { contains: q.trim(), mode: 'insensitive' };
  }
  const barangays = await prisma.barangay.findMany({
    where,
    orderBy: { name: 'asc' },
    take: MAX_RESULTS,
  });
  cached(res, 300); res.json({ success: true, data: barangays, meta: { limit: MAX_RESULTS } });
}

export async function listBarangays(req, res) {
  const { municipalityCode } = req.query;
  if (!municipalityCode) {
    return res.status(400).json({ success: false, error: 'municipalityCode query parameter is required.' });
  }
  const barangays = await prisma.barangay.findMany({
    where: { municipalityCode: code(municipalityCode, 'municipalityCode') },
    orderBy: { name: 'asc' },
  });
  cached(res, 300); res.json({ success: true, data: barangays.slice(0, MAX_RESULTS), meta: { limit: MAX_RESULTS } });
}
