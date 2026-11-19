import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client per process. Connection pool size is set through DATABASE_URL
 * (`connection_limit`); in production point it at PgBouncer or a sized pool.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Raw Prisma diagnostics may contain query arguments; the HTTP layer logs safe categories.
    super({ log: [] });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class DatabaseModule {}
