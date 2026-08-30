'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PermissionGate } from '@/components/permission-gate';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface CompanySettings {
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  phone2: string;
  email: string;
  website: string;
  logoUrl: string;
  invoiceTermsDefaultText?: string;
  deliveryTermsDefaultText?: string;
}

export default function CompanySettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => apiClient.get<CompanySettings>('/company-settings'),
  });

  const [formData, setFormData] = useState<CompanySettings>({
    companyName: '',
    addressLine1: '',
    addressLine2: '',
    phone: '',
    phone2: '',
    email: '',
    website: '',
    logoUrl: '',
    invoiceTermsDefaultText: '',
    deliveryTermsDefaultText: '',
  });

  useEffect(() => {
    if (settingsQuery.data) {
      // The query response is the external source that initializes this editable draft.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        companyName: settingsQuery.data.companyName || '',
        addressLine1: settingsQuery.data.addressLine1 || '',
        addressLine2: settingsQuery.data.addressLine2 || '',
        phone: settingsQuery.data.phone || '',
        phone2: settingsQuery.data.phone2 || '',
        email: settingsQuery.data.email || '',
        website: settingsQuery.data.website || '',
        logoUrl: settingsQuery.data.logoUrl || '',
        invoiceTermsDefaultText: settingsQuery.data.invoiceTermsDefaultText || '',
        deliveryTermsDefaultText: settingsQuery.data.deliveryTermsDefaultText || '',
      });
    }
  }, [settingsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CompanySettings>) => apiClient.patch('/company-settings', data),
    onSuccess: () => {
      toast.success('Settings updated successfully');
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not update settings');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate(formData);
  }

  return (
    <PermissionGate permission="company_settings.manage">
      <div className="flex flex-col gap-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Company Settings</h1>
          <p className="text-muted-foreground">Manage your business details, logo, and contact information for PDFs.</p>
        </div>

        {settingsQuery.isLoading ? (
          <Skeleton className="h-[400px] w-full rounded-xl" />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Business Profile</CardTitle>
              <CardDescription>This information will appear on all generated documents like quotations and invoices.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    required
                  />
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number 1</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+92 300 1234567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone2">Phone Number 2</Label>
                    <Input
                      id="phone2"
                      value={formData.phone2}
                      onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
                      placeholder="+92 300 7654321"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="sales@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      placeholder="www.company.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="addressLine1">Address Line 1</Label>
                  <Input
                    id="addressLine1"
                    value={formData.addressLine1}
                    onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                    placeholder="Street address, P.O. box"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="addressLine2">Address Line 2 (City, State, ZIP)</Label>
                  <Input
                    id="addressLine2"
                    value={formData.addressLine2}
                    onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                    placeholder="Dubai, UAE"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logoUrl">Logo URL</Label>
                  <Input
                    id="logoUrl"
                    value={formData.logoUrl}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    placeholder="https://example.com/logo.png"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Provide a direct link to your company logo image (PNG or JPG). It will appear on the top left of your PDFs.
                  </p>
                </div>

                {formData.logoUrl && (
                  <div className="mt-4 p-4 border rounded-md bg-muted/20 inline-block">
                    <p className="text-xs font-semibold mb-2 text-muted-foreground">LOGO PREVIEW</p>
                    <img src={formData.logoUrl} alt="Company Logo" className="max-h-16 object-contain" />
                  </div>
                )}

                <div className="pt-4 border-t mt-6 space-y-4">
                  <h3 className="text-lg font-medium">Default Document Terms</h3>
                  <div className="space-y-2">
                    <Label htmlFor="invoiceTermsDefaultText">Sales Invoice Default Terms</Label>
                    <Input
                      id="invoiceTermsDefaultText"
                      value={formData.invoiceTermsDefaultText || ''}
                      onChange={(e) => setFormData({ ...formData, invoiceTermsDefaultText: e.target.value })}
                      placeholder="e.g., Net 30, Goods once sold..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deliveryTermsDefaultText">Delivery Order Default Terms</Label>
                    <Input
                      id="deliveryTermsDefaultText"
                      value={formData.deliveryTermsDefaultText || ''}
                      onChange={(e) => setFormData({ ...formData, deliveryTermsDefaultText: e.target.value })}
                      placeholder="e.g., Deliver to site..."
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </PermissionGate>
  );
}
