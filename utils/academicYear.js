
function deriveAcademicYear(startDate) {
  const date = new Date(`${startDate}T00:00:00`);
  
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid start date');
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  const startYear = month >= 7 ? year : year - 1;
  const endYear = String(startYear + 1).slice(-2);

  return `${startYear}-${endYear}`;
}

module.exports = { deriveAcademicYear };
