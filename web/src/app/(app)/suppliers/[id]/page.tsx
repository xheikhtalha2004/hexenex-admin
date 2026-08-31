import SupplierDetailPage from './supplier-detail-client';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <SupplierDetailPage />;
}
