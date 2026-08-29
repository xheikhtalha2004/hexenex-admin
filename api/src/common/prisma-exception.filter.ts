import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Maps Prisma's known error codes to proper HTTP responses app-wide, instead of every
 * `findUniqueOrThrow`/unique-constraint call needing its own try/catch. Without this, an
 * invalid foreign key (e.g. a settlement referencing a nonexistent supplierId) surfaces as an
 * opaque 500 rather than a 404 the client can actually act on.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const httpException = this.toHttpException(exception);
    const response = host.switchToHttp().getResponse();
    response.status(httpException.getStatus()).json(httpException.getResponse());
  }

  private toHttpException(exception: Prisma.PrismaClientKnownRequestError): HttpException {
    switch (exception.code) {
      case 'P2025':
        return new NotFoundException('The requested record was not found');
      case 'P2002':
        return new ConflictException('A record with this value already exists');
      case 'P2003':
        return new NotFoundException('A referenced record was not found');
      default:
        return new InternalServerErrorException('Database error');
    }
  }
}
