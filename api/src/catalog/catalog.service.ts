import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate } from '../common/pagination.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Categories ──────────────────────────────────────────────────────────

  listCategories(includeInactive = true) {
    return this.prisma.productCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async createCategory(dto: CreateCategoryDto, actorId: string) {
    const existing = await this.prisma.productCategory.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('A category with this name already exists');

    const category = await this.prisma.productCategory.create({ data: { name: dto.name } });
    await this.audit.log({ userId: actorId, action: 'CREATE', entityType: 'ProductCategory', entityId: category.id, afterData: category });
    return category;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, actorId: string) {
    const before = await this.findCategoryOrThrow(id);
    const after = await this.prisma.productCategory.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entityType: 'ProductCategory', entityId: id, beforeData: before, afterData: after });
    return after;
  }

  private async findCategoryOrThrow(id: string) {
    const category = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  // ── Products ─────────────────────────────────────────────────────────────

  async listProducts(query: ListProductsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.ProductWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginate(data, total, page, pageSize);
  }

  /** Flat, unpaginated list of active products — for pickers (invoices, transfers, adjustments), not browsing. */
  listActiveProductsForPicker() {
    return this.prisma.product.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async findProductOrThrow(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: { category: true } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async createProduct(dto: CreateProductDto, actorId: string) {
    await this.findCategoryOrThrow(dto.categoryId);
    const existing = await this.prisma.product.findUnique({
      where: { categoryId_name: { categoryId: dto.categoryId, name: dto.name } },
    });
    if (existing) throw new ConflictException('A product with this name already exists in this category');

    const product = await this.prisma.product.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        reorderLevel: dto.reorderLevel,
        isSlabTracked: dto.isSlabTracked ?? false,
      },
      include: { category: true },
    });
    await this.audit.log({ userId: actorId, action: 'CREATE', entityType: 'Product', entityId: product.id, afterData: product });
    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto, actorId: string) {
    const before = await this.findProductOrThrow(id);
    if (dto.categoryId) await this.findCategoryOrThrow(dto.categoryId);

    const after = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: { category: true },
    });
    await this.audit.log({ userId: actorId, action: 'UPDATE', entityType: 'Product', entityId: id, beforeData: before, afterData: after });
    return after;
  }
}
