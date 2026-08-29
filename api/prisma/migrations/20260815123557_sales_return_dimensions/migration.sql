-- AlterTable
ALTER TABLE "SalesReturnItem" ADD COLUMN     "description" TEXT,
ADD COLUMN     "length" DECIMAL(14,2),
ADD COLUMN     "pieces" DECIMAL(14,2),
ADD COLUMN     "sizeOption" TEXT,
ADD COLUMN     "usableLength" DECIMAL(14,2),
ADD COLUMN     "usableWidth" DECIMAL(14,2),
ADD COLUMN     "width" DECIMAL(14,2);
