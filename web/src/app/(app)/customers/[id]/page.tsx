import CustomerDetailPage from './customer-detail-client';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <CustomerDetailPage />;
}
