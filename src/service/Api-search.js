// src/service/Api-search.js
const API_BASE_URL = 'http://localhost:8080/Api-search';
 
function normalizeBio(rawBio) {
  if (!rawBio) return '';
 
  // Si ya es string, la devolvemos tal cual
  if (typeof rawBio === 'string') return rawBio;
 
  // Si viene como array (por ejemplo ['texto largo...'])
  if (Array.isArray(rawBio)) {
    return rawBio.join(' ');
  }
 
  // Si viene como objeto con propiedad text o similar
  if (typeof rawBio === 'object') {
    if (typeof rawBio.text === 'string') return rawBio.text;
    if (typeof rawBio.value === 'string') return rawBio.value;
  }
 
  // Último recurso: casteo a string
  return String(rawBio);
}
 
class ApiSearchService {
  /**
   * Obtiene los 10 mejores tutores del sistema
   */
  static async getTopTutors() {
    try {
      const url = `${API_BASE_URL}/tutors/top`;
      const res = await fetch(url, { method: 'GET' });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error(
          'Error HTTP en ApiSearchService.getTopTutors:',
          res.status,
          errorText
        );
        throw new Error('Error obteniendo mejores tutores');
      }

      const data = await res.json();
      if (!Array.isArray(data)) return [];

      return data.map((t) => {
        let rating;
        if (typeof t.rating === 'number') {
          rating = t.rating;
        } else if (typeof t.ratingValue === 'number') {
          rating = t.ratingValue;
        } else {
          rating = undefined;
        }

        let tokensPerHour;
        if (typeof t.tokensPerHour === 'number') {
          tokensPerHour = t.tokensPerHour;
        } else if (typeof t.rate === 'number') {
          tokensPerHour = t.rate;
        } else {
          tokensPerHour = undefined;
        }

        return {
          userId: t.userId ?? t.id ?? '',
          name: t.name ?? '',
          email: t.email ?? '',
          bio: normalizeBio(t.bio ?? t.biography),
          specializations: Array.isArray(t.specializations)
            ? t.specializations
            : [],
          credentials: Array.isArray(t.credentials) ? t.credentials : [],
          rating,
          tokensPerHour,
        };
      });
    } catch (err) {
      console.error('ApiSearchService.getTopTutors error:', err);
      throw err;
    }
  }

  static async searchTutors(query) {
    try {
      const trimmed = (query ?? '').trim();
      const hasQuery = trimmed.length > 0;
 
      const url = hasQuery
        ? `${API_BASE_URL}/tutors?q=${encodeURIComponent(trimmed)}`
        : `${API_BASE_URL}/tutors`;
 
      const res = await fetch(url, { method: 'GET' });
 
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error(
          'Error HTTP en ApiSearchService.searchTutors:',
          res.status,
          errorText
        );
        throw new Error('Error buscando tutores');
      }
 
      const data = await res.json();
 
      if (!Array.isArray(data)) return [];
 
      return data.map((t) => {
        // Extract complex evaluations into independent statements
        let rating;
        if (typeof t.rating === 'number') {
          rating = t.rating;
        } else if (typeof t.ratingValue === 'number') {
          rating = t.ratingValue;
        } else {
          rating = undefined;
        }
 
        let tokensPerHour;
        if (typeof t.tokensPerHour === 'number') {
          tokensPerHour = t.tokensPerHour;
        } else if (typeof t.rate === 'number') {
          tokensPerHour = t.rate;
        } else {
          tokensPerHour = undefined;
        }
 
        return {
          userId: t.userId ?? t.id ?? t.sub ?? '',
          name: t.name ?? '',
          email: t.email ?? '',
          bio: normalizeBio(t.bio ?? t.biography),
          // Si el backend ya manda specializations como array de objetos, lo dejamos igual
          specializations: Array.isArray(t.specializations)
            ? t.specializations
            : [],
          credentials: Array.isArray(t.credentials) ? t.credentials : [],
          rating,
          tokensPerHour,
        };
      });
    } catch (err) {
      console.error('ApiSearchService.searchTutors error:', err);
      throw err;
    }
  }
}

export default ApiSearchService;
