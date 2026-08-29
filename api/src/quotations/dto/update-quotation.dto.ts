import { CreateQuotationDto } from './create-quotation.dto';

/** Editing a DRAFT quotation replaces its items wholesale — same shape as creation. */
export class UpdateQuotationDto extends CreateQuotationDto {}
