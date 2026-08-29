import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/types/request-user';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';

// Categories and products are reference data needed by every role that picks a product
// (sales, quotations, purchases...), so GET endpoints have no permission requirement beyond
// being an authenticated user (enforced globally by JwtAuthGuard). Only mutations are
// gated behind `product.manage`.
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('product-categories')
  listCategories() {
    return this.catalog.listCategories();
  }

  @Post('product-categories')
  @RequirePermissions('product.manage')
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() actor: RequestUser) {
    return this.catalog.createCategory(dto, actor.id);
  }

  @Patch('product-categories/:id')
  @RequirePermissions('product.manage')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto, @CurrentUser() actor: RequestUser) {
    return this.catalog.updateCategory(id, dto, actor.id);
  }

  @Get('products')
  listProducts(@Query() query: ListProductsQueryDto) {
    return this.catalog.listProducts(query);
  }

  @Get('product-picker')
  listActiveProductsForPicker() {
    return this.catalog.listActiveProductsForPicker();
  }

  @Get('products/:id')
  findProduct(@Param('id') id: string) {
    return this.catalog.findProductOrThrow(id);
  }

  @Post('products')
  @RequirePermissions('product.manage')
  createProduct(@Body() dto: CreateProductDto, @CurrentUser() actor: RequestUser) {
    return this.catalog.createProduct(dto, actor.id);
  }

  @Patch('products/:id')
  @RequirePermissions('product.manage')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() actor: RequestUser) {
    return this.catalog.updateProduct(id, dto, actor.id);
  }
}
