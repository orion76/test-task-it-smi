import { Int } from '@nestjs/graphql';
import type { ArgsOptions } from '@nestjs/graphql';

import {
  OFFSET_DEFAULT,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
} from '../../common/contracts/pagination';

/**
 * GraphQL arguments of a list query. The defaults are declared on the arguments, so they are part of
 * the schema: a list query without arguments keeps working. The bounds are only documented here —
 * they are enforced by `assertPagination`, because an out-of-range page is a rule of the list.
 */
export const PAGE_LIMIT_ARG = {
  type: () => Int,
  defaultValue: PAGE_SIZE_DEFAULT,
  description: `Maximum number of rows to return (1-${PAGE_SIZE_MAX}).`,
} as const satisfies ArgsOptions;

/** @see PAGE_LIMIT_ARG */
export const PAGE_OFFSET_ARG = {
  type: () => Int,
  defaultValue: OFFSET_DEFAULT,
  description: 'Number of rows to skip, for paging through the list.',
} as const satisfies ArgsOptions;
