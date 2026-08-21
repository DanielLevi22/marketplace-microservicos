import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeormTestConfig: TypeOrmModuleOptions = {
  type: 'better-sqlite3',
  database: ':memory:',
  dropSchema: true,
  entities: [__dirname + '/../../src/**/*.entity.{ts,js}'],
  synchronize: true,
};
