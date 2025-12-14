const API_BASE_URL =
    'https://calls-b7f6fcdpbvdxcmeu.chilecentral-01.azurewebsites.net';


const USER_API_BASE_URL =
    'https://user-service.duckdns.org/Api-user';

export type TutorReview = {
    id: string;
    tutorId: string;
    studentId: string;
    studentName: string;
    rating: number;
    comment?: string;
    createdAt: string;
};

export type TutorRatingSummary = {
    tutorId: string;
    avg: number;
    count: number;
};

export type PublicUserProfile = {
    userId?: string;
    sub?: string;
    name?: string;
    email?: string;
};

function authHeaders(token?: string): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (token && token.trim()) h.Authorization = `Bearer ${token.replace(/^Bearer\s+/i, '')}`;
    return h;
}

export async function getTutorRatingSummary(
    tutorId: string,
    token?: string
): Promise<TutorRatingSummary> {
    const res = await fetch(
        `${API_BASE_URL}/api/reviews/tutor/${encodeURIComponent(tutorId)}/summary`,
        { headers: authHeaders(token), credentials: 'include' }
    );
    if (!res.ok) return { tutorId, avg: 0, count: 0 };
    return res.json();
}

export async function getTutorReviews(
    tutorId: string,
    limit = 20,
    token?: string
): Promise<TutorReview[]> {
    const res = await fetch(
        `${API_BASE_URL}/api/reviews/tutor/${encodeURIComponent(tutorId)}?limit=${limit}`,
        { headers: authHeaders(token), credentials: 'include' }
    );
    if (!res.ok) return [];
    return res.json();
}


export async function getPublicProfile(
    params: { id?: string; sub?: string },
    token?: string
): Promise<PublicUserProfile> {
    const qs = new URLSearchParams();
    if (params.sub) qs.set('sub', params.sub);
    if (params.id) qs.set('id', params.id);

    const url = `${USER_API_BASE_URL.replace(/\/+$/, '')}/Api-user/public/profile?${qs.toString()}`;

    const res = await fetch(url, {
        method: 'GET',
        headers: authHeaders(token),
        credentials: 'include',
    });

    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Public profile failed: ${res.status} ${txt}`.trim());
    }

    return res.json();
}
