(function (root) {
  'use strict';
  // Stores the planner state in one private GitHub gist so every device with the token sees the same data.
  const API = 'https://api.github.com';
  const FILE = 'fe-planner.json';
  const DESCRIPTION = '만자천홍 부대 편성실 동기화 데이터';

  async function gh(token, path, options = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        ...options,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(options.body ? { 'Content-Type': 'application/json' } : {})
        }
      });
    } catch {
      throw Object.assign(new Error('인터넷 연결을 확인해주세요.'), { offline: true });
    }
    if (!res.ok) {
      const message = res.status === 401 ? '토큰이 올바르지 않거나 만료되었습니다.'
        : res.status === 403 || res.status === 404 ? '토큰에 gist 권한이 없거나 동기화 데이터를 찾을 수 없습니다.'
        : `GitHub 응답 오류 (${res.status})`;
      throw Object.assign(new Error(message), { status: res.status });
    }
    return res.json();
  }

  async function find(token) {
    for (let page = 1; page <= 10; page++) {
      const list = await gh(token, `/gists?per_page=100&page=${page}`);
      const hit = list.find(g => g.files && g.files[FILE]);
      if (hit) return hit.id;
      if (list.length < 100) break;
    }
    return null;
  }

  async function read(token, id) {
    const gist = await gh(token, `/gists/${id}`);
    const file = gist.files && gist.files[FILE];
    if (!file) throw new Error('동기화 파일을 찾을 수 없습니다.');
    const text = file.truncated ? await (await fetch(file.raw_url, { cache: 'no-store' })).text() : file.content;
    try { return JSON.parse(text); } catch { throw new Error('동기화 데이터가 손상되었습니다.'); }
  }

  function write(token, id, data) {
    return gh(token, `/gists/${id}`, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(data) } } }) });
  }

  async function create(token, data) {
    const gist = await gh(token, '/gists', { method: 'POST', body: JSON.stringify({ description: DESCRIPTION, public: false, files: { [FILE]: { content: JSON.stringify(data) } } }) });
    return gist.id;
  }

  root.GistSync = { find, read, write, create };
})(globalThis);
