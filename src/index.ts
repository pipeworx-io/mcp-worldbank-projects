interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * World Bank Projects & Operations MCP.
 *
 * Keyless search over ~20,000 World Bank development projects — financing
 * (commitments, grants, project cost), sectors, themes, status, and results.
 * Source: search.worldbank.org/api/v2/projects. A lending/operations complement
 * to the keyless `worldbank` indicators pack (which covers macro statistics, not
 * individual projects).
 */


const BASE = 'https://search.worldbank.org/api/v2';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_projects',
    description:
      'Search World Bank development projects by free text and/or country and status. Returns financing, sectors, lending instrument, approval/closing dates, and status for each match. Keyless. Provide query and/or country_code.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Free-text search, e.g. "rural water supply", "climate resilience", "rural electrification".',
        },
        country_code: {
          type: 'string',
          description: 'ISO-2 country code to filter by, e.g. "BR" (Brazil), "KE" (Kenya), "IN" (India).',
        },
        status: {
          type: 'string',
          description: 'Project status filter: "Active", "Closed", "Pipeline", or "Dropped".',
        },
        limit: { type: 'number', description: 'Max projects to return (default 10, max 25).' },
      },
    },
  },
  {
    name: 'get_project',
    description:
      'Get the fuller record for a single World Bank project by its project id (e.g. "P006553", "P501648"): financing breakdown, implementing agency, borrower, sectors, themes, and the project development objective / abstract. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'World Bank project id, e.g. "P006553" or "P501648". Find ids via search_projects.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'projects_by_country',
    description:
      'List a country\'s World Bank projects (newest board-approval first) filtered by status. Returns the compact project shape with financing, sectors, and dates. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        country_code: {
          type: 'string',
          description: 'ISO-2 country code, e.g. "KE" (Kenya), "BR" (Brazil), "NG" (Nigeria).',
        },
        status: {
          type: 'string',
          description: 'Status filter (default "Active"): "Active", "Closed", "Pipeline", or "Dropped".',
        },
        limit: { type: 'number', description: 'Max projects to return (default 15, max 30).' },
      },
      required: ['country_code'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'search_projects':
        return searchProjects(args);
      case 'get_project':
        return getProject(args);
      case 'projects_by_country':
        return projectsByCountry(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Parse a comma-formatted numeric string like "104,000,000" → number, else null. */
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

type Raw = Record<string, unknown>;

async function wbGet(params: Record<string, string | number | undefined>): Promise<
  { ok: true; total: number; projects: Raw[] } | { ok: false; error: string }
> {
  const qs = new URLSearchParams({ format: 'json' });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const res = await fetch(`${BASE}/projects?${qs.toString()}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) return { ok: false, error: `World Bank: ${res.status} ${(await res.text()).slice(0, 200)}` };

  const body = (await res.json()) as Record<string, unknown>;
  const projObj = (body.projects ?? {}) as Record<string, Raw>;
  const projects = projObj && typeof projObj === 'object' ? Object.values(projObj) : [];
  const total = num(body.total) ?? projects.length;
  return { ok: true, total, projects };
}

function names(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => (s && typeof s === 'object' ? (s as Raw).name ?? (s as Raw).Name : s))
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    .slice(0, max);
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapProject(p: Raw, opts: { full: boolean } = { full: false }): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: p.id,
    name: p.project_name,
    country: p.countryshortname,
    region: p.regionname,
    status: p.projectstatusdisplay ?? p.status,
    total_commitment_usd: num(p.totalcommamt),
    board_approval_date: p.boardapprovaldate ?? null,
    closing_date: p.closingdate ?? null,
    sectors: names(p.sector, 5),
    lending_instrument: p.lendinginstr ?? null,
    url: p.url ?? null,
  };
  if (!opts.full) return base;

  let abstract: string | null = null;
  const abs = p.project_abstract as Raw | undefined;
  // The API key is "cdata!" (with trailing bang); accept "cdata" too for safety.
  const cdata = abs && typeof abs === 'object' ? (abs['cdata!'] ?? abs.cdata) : undefined;
  if (typeof cdata === 'string' && cdata.trim()) {
    const clean = stripHtml(cdata);
    abstract = clean.length > 800 ? `${clean.slice(0, 800)}…` : clean;
  }

  return {
    ...base,
    grant_amount_usd: num(p.grantamt),
    project_cost_usd: num(p.lendprojectcost),
    implementing_agency: p.impagency ?? null,
    borrower: p.borrower ?? null,
    themes: names(p.mjtheme_namecode, 8),
    abstract,
  };
}

async function searchProjects(args: Record<string, unknown>): Promise<unknown> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const countryCode = typeof args.country_code === 'string' ? args.country_code.trim().toUpperCase() : '';
  if (!query && !countryCode) return { error: 'provide query and/or country_code' };

  const status = typeof args.status === 'string' ? args.status.trim() : '';
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);

  const r = await wbGet({
    qterm: query || undefined,
    countrycode_exact: countryCode || undefined,
    status_exact: status || undefined,
    rows: limit,
    os: 0,
  });
  if (!r.ok) return { error: r.error };
  if (r.projects.length === 0) return { total: r.total, count: 0, projects: [] };

  return {
    total: r.total,
    count: r.projects.length,
    projects: r.projects.map((p) => mapProject(p)),
  };
}

async function getProject(args: Record<string, unknown>): Promise<unknown> {
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  if (!id) return { error: 'provide a project id, e.g. "P006553"', id: args.id ?? null };

  const r = await wbGet({ id });
  if (!r.ok) return { error: r.error };
  const p = r.projects.find((x) => String(x.id).toUpperCase() === id.toUpperCase()) ?? r.projects[0];
  if (!p) return { error: 'project not found', id };

  return mapProject(p, { full: true });
}

async function projectsByCountry(args: Record<string, unknown>): Promise<unknown> {
  const countryCode = typeof args.country_code === 'string' ? args.country_code.trim().toUpperCase() : '';
  if (!countryCode) return { error: 'provide an ISO-2 country_code, e.g. "KE"' };

  const status = (typeof args.status === 'string' && args.status.trim()) || 'Active';
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 30);

  const r = await wbGet({
    countrycode_exact: countryCode,
    status_exact: status,
    rows: limit,
    os: 0,
  });
  if (!r.ok) return { error: r.error };
  if (r.projects.length === 0) return { country_code: countryCode, status, count: 0, projects: [] };

  const projects = r.projects
    .map((p) => mapProject(p))
    .sort((a, b) =>
      String(b.board_approval_date ?? '').localeCompare(String(a.board_approval_date ?? '')),
    );

  return { country_code: countryCode, status, count: projects.length, projects };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
