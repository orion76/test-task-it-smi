/**
 * Every field of `Profile` and of its nested collections, exactly as published by the API
 * (`config/api-fields.yml`). The fragment is shared by the single-profile and the page queries, so
 * both show the same selection and the nested collections are resolved by the backend loaders.
 */
const PROFILE_FIELDS = `
  fragment ProfileFields on Profile {
    id
    name
    description
    links {
      id
      label
      url
      kind
    }
    skills {
      id
      name
      category
    }
    experience {
      id
      company
      position
      startedAt
      endedAt
      finished
      achievements
    }
    projects {
      id
      name
      url
      description
    }
  }
`;

/** `health { status }` — the readiness check of the backend. */
export const HEALTH_QUERY = `
  query Health {
    health {
      status
    }
  }
`;

/** The profile with every nested collection; a 404 comes back as a GraphQL error. */
export const PROFILE_QUERY = `
  query Profile {
    profile {
      ...ProfileFields
    }
  }
  ${PROFILE_FIELDS}
`;

/** One page of profiles: `limit` is 1..100 on the server, the page starts at `offset`. */
export const PROFILES_QUERY = `
  query Profiles($limit: Int!, $offset: Int!) {
    profiles(limit: $limit, offset: $offset) {
      ...ProfileFields
    }
  }
  ${PROFILE_FIELDS}
`;

/**
 * The request from the assignment text (`TZ/TZ.md`). It is pre-filled in the free-form mode: pasting
 * it as is has to work against the current schema, without any change of the schema.
 */
export const TZ_EXAMPLE_QUERY = `query {
  profile {
    name
    description
    skills {
      name
    }
    experience {
      company
      position
    }
    projects {
      name
    }
  }
}`;
