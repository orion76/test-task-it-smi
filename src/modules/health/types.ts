/**
 * Status the application reports about itself: the only value both endpoints answer with.
 */
export type UHealthStatus = 'ok';

/**
 * Response of the HTTP healthcheck endpoint. The GraphQL model declares its field with the same
 * type, so the two endpoints cannot report different statuses.
 */
export interface IHealthStatus {
  status: UHealthStatus;
}

/**
 * Contract of the HTTP healthcheck: the container and the deployment call it, and nothing else
 * depends on the controller itself.
 */
export interface IHealthController {
  /**
   * Returns the status of the application.
   */
  check(): IHealthStatus;
}

/**
 * Contract of the GraphQL healthcheck: a client that already talks to `/graphql` asks the same
 * question the HTTP endpoint answers.
 */
export interface IHealthResolver {
  /**
   * Returns the status of the application.
   */
  health(): IHealthStatus;
}
