import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import type { Settings } from '../types/api.js';
import { Alert, Button, Card, Field, Input, Select, Spinner } from '../components/ui.js';
import { useAuth } from '../contexts/AuthContext.js';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api.getSettings().then((r) => setSettings(r.settings)).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load settings'));
  }, []);

  const submitProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    const f = new FormData(e.currentTarget);
    const payload = {
      fullName: String(f.get('fullName') ?? ''),
      businessName: String(f.get('businessName') ?? ''),
      businessType: String(f.get('businessType') ?? ''),
      phone: String(f.get('phone') ?? ''),
    };
    try {
      await api.updateProfile(payload);
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setBusy(false);
    }
  };

  const submitSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    const f = new FormData(e.currentTarget);
    const payload = {
      businessName: String(f.get('businessName') ?? ''),
      businessType: String(f.get('businessType') ?? ''),
      replyToEmail: String(f.get('replyToEmail') ?? ''),
      currency: String(f.get('currency') ?? 'USD'),
      emailNotifications: f.get('emailNotifications') === 'on',
    };
    try {
      await api.updateSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    const f = new FormData(e.currentTarget);
    const currentPassword = String(f.get('currentPassword') ?? '');
    const newPassword = String(f.get('newPassword') ?? '');
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      setBusy(false);
      return;
    }
    try {
      await api.changePassword(currentPassword, newPassword);
      e.currentTarget.reset();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return error ? <Alert tone="error">{error}</Alert> : <Spinner label="Loading settings…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Your business profile, email defaults, and account security.</p>
      </div>

      {saved ? <Alert tone="success">Saved ✓</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Business profile" subtitle="Shown on emails your customers receive">
          <form onSubmit={submitProfile} className="space-y-4">
            <Field label="Your name"><Input name="fullName" defaultValue={user?.fullName} /></Field>
            <Field label="Business name"><Input name="businessName" defaultValue={user?.businessName} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Trade">
                <Select name="businessType" defaultValue={user?.businessType}>
                  <option value="">—</option>
                  <option value="plumbing">Plumbing</option>
                  <option value="electrical">Electrical</option>
                  <option value="roofing">Roofing</option>
                  <option value="hvac">HVAC</option>
                  <option value="landscaping">Landscaping</option>
                  <option value="general">General contractor</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Phone"><Input name="phone" defaultValue={user?.phone} /></Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card title="Email defaults" subtitle="Used when sending customer emails">
            <form onSubmit={submitSettings} className="space-y-4">
              <Field label="Business name on emails"><Input name="businessName" defaultValue={settings.businessName} /></Field>
              <Field label="Reply-to email"><Input type="email" name="replyToEmail" defaultValue={settings.replyToEmail} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Currency">
                  <Select name="currency" defaultValue={settings.currency}>
                    <option value="USD">USD — US Dollar</option>
                    <option value="CAD">CAD — Canadian Dollar</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="AUD">AUD — Australian Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                  </Select>
                </Field>
                <Field label="Trade">
                  <Select name="businessType" defaultValue={settings.businessType}>
                    <option value="">—</option>
                    <option value="plumbing">Plumbing</option>
                    <option value="electrical">Electrical</option>
                    <option value="roofing">Roofing</option>
                    <option value="hvac">HVAC</option>
                    <option value="landscaping">Landscaping</option>
                    <option value="general">General contractor</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="emailNotifications" defaultChecked={settings.emailNotifications} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                Send email notifications for new lead captures
              </label>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save email settings'}</Button>
              </div>
            </form>
          </Card>

          <Card title="Change password" subtitle="Keep your account secure">
            <form onSubmit={submitPassword} className="space-y-4">
              <Field label="Current password"><Input type="password" name="currentPassword" required /></Field>
              <Field label="New password" hint="At least 8 characters"><Input type="password" name="newPassword" required /></Field>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}