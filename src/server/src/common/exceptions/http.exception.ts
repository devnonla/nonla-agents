/**
 * NestJS-style HTTP exceptions cho Hono.
 *
 * Usage:
 *   throw new BadRequestException("Invalid email");
 *   throw new InternalServerErrorException("Something went wrong");
 *
 * Global error handler trong app.ts sẽ tự catch và trả JSON response.
 */

export class HttpException extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class BadRequestException extends HttpException {
  constructor(message = "Bad Request") {
    super(400, message);
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message = "Internal Server Error") {
    super(500, message);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = "Forbidden") {
    super(403, message);
  }
}

export class NotFoundException extends HttpException {
  constructor(message = "Not Found") {
    super(404, message);
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(message = "Service Unavailable") {
    super(503, message);
  }
}
