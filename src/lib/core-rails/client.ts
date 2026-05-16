import { serverEnv } from "@/lib/env";

export interface CoreRailsOperator {
  name: string;
}

export interface CoreRailsDepartment {
  code: string;
  name: string;
}

export interface CoreRailsGrade {
  name: string;
  title: string | null;
}

export interface CoreRailsAcceptedItem {
  name: string;
  actualAmount: number | null;
  prospectedAmount: number | null;
  grade: CoreRailsGrade | null;
}

export interface ContractedProject {
  id: string;
  state: string;
  contractedAt: string;
  thoughts: string | null;
  methodCode: string | null;
  backgroundCode: string | null;
  operator: CoreRailsOperator | null;
  department: CoreRailsDepartment | null;
  acceptedItems: CoreRailsAcceptedItem[];
}

const CONTRACTED_PROJECTS_QUERY = `
  query ContractedProjects($contractedAtGte: ISO8601DateTime!) {
    contractedProjects(contractedAtGte: $contractedAtGte) {
      nodes {
        id
        state
        contractedAt
        thoughts
        methodCode
        backgroundCode
        operator {
          name
        }
        department {
          code
          name
        }
        acceptedItems {
          name
          actualAmount
          prospectedAmount
          grade { name title }
        }
      }
    }
  }
`;

export async function fetchContractedProjects(
  contractedAtGte: string
): Promise<ContractedProject[]> {
  const url = serverEnv.CORE_RAILS_URL;
  const user = serverEnv.CORE_RAILS_GRAPHQL_USER;
  const pass = serverEnv.CORE_RAILS_GRAPHQL_PASS;

  if (!url || !user || !pass) {
    return [];
  }

  const basicAuth = Buffer.from(`${user}:${pass}`).toString("base64");

  const res = await fetch(`${url}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: JSON.stringify({
      query: CONTRACTED_PROJECTS_QUERY,
      variables: { contractedAtGte },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`core-rails GraphQL error: ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: { contractedProjects?: { nodes: ContractedProject[] } };
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join(", "));
  }

  return json.data?.contractedProjects?.nodes ?? [];
}
