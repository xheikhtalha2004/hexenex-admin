import { Module } from '@nestjs/common';
import { QuotationEngineService } from './quotation-engine.service';
import { PlaceholderManualStrategy } from './placeholder-manual.strategy';
import { SqftDimensionsStrategy } from './sqft-dimensions.strategy';

@Module({
  providers: [QuotationEngineService, PlaceholderManualStrategy, SqftDimensionsStrategy],
  exports: [QuotationEngineService],
})
export class QuotationEngineModule {}
