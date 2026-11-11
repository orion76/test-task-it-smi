import { BadRequestException } from '@nestjs/common';

import { PAGE_SIZE_MAX } from '../../common/contracts/pagination';
import type { IPagination } from '../../common/contracts/types';

/**
 * Validates the page window a client asked for. GraphQL already rejects non-integers and `null`, so
 * only the range is left; `Number.isInteger` also rejects `undefined`, which would otherwise turn
 * into an unlimited query.
 *
 * @throws BadRequestException naming the argument and the accepted range
 */
export function assertPagination(page: IPagination): void {
  const { limit, offset } = page;

  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_SIZE_MAX) {
    throw new BadRequestException(
      `limit must be an integer between 1 and ${PAGE_SIZE_MAX}, received ${String(limit)}.`,
    );
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new BadRequestException(
      `offset must be a non-negative integer, received ${String(offset)}.`,
    );
  }
}
