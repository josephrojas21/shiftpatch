'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Download, FileCheck2, FileText, LockKeyhole, Upload, X } from 'lucide-react';
import { Badge, Empty, ErrorState, Field, Spinner, Submit } from '@/components/ui';
import { testIds, type CredentialDto } from '@/contracts';
import { api, displayDate, json } from '../shared/api';
import { track } from '../shared/analytics';
import { useAction, useWorkspace } from '../shared/workspace';
export function Credentials() {
  const { user } = useWorkspace();
  const admin = user.role === 'admin';
  const formRef = useRef<HTMLFormElement>(null);
  const [localError, setLocalError] = useState('');
  const query = useQuery({
    queryKey: ['credentials', user.id],
    queryFn: () => api<{ credentials: CredentialDto[] }>('/api/credentials'),
    refetchInterval: 10000,
  });
  const upload = useAction(
    (form: FormData) => api('/api/credentials', { method: 'POST', body: form }),
    'Document uploaded and awaiting review.',
    () => {
      formRef.current?.reset();
      track('credential_uploaded');
    },
  );
  const review = useAction(
    ({ id, status }: { id: string; status: string }) =>
      api(`/api/credentials/${id}/review`, { method: 'POST', body: json({ status }) }),
    'Document review saved.',
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file') as File;
    if (file.size > 4 * 1024 * 1024) {
      setLocalError('Choose a file smaller than 4 MB.');
      return;
    }
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) {
      setLocalError('Choose a PDF, PNG or JPEG document.');
      return;
    }
    setLocalError('');
    upload.mutate(form);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow muted">TRUST, KEPT UP TO DATE</span>
          <h1>
            {admin ? 'Credential review' : 'My credentials'}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {admin
              ? 'Review supporting documents and keep care teams ready.'
              : 'Your qualifications, securely stored and ready for your next shift.'}
          </p>
        </div>
        {admin && (
          <a className="button secondary" download href="/api/admin/exports/documents">
            <Download size={17} />
            Export documents
          </a>
        )}
      </div>
      <div className={admin ? '' : 'content-columns'}>
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>{admin ? 'Nurse documents' : 'Your documents'}</h2>
              <p>
                {admin
                  ? 'Only approved, current licenses permit shift claims.'
                  : 'Uploads require approval before they can support a shift claim.'}
              </p>
            </div>
            <FileCheck2 className="teal" size={25} />
          </div>
          {query.isPending ? (
            <Spinner />
          ) : query.error ? (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          ) : query.data.credentials.length === 0 ? (
            <Empty title="Your credentials belong here">
              Upload your license or TB test to get started.
            </Empty>
          ) : (
            <div className="document-list">
              {query.data.credentials.map((doc) => {
                const expired = doc.expiresAt < new Date().toISOString().slice(0, 10);
                return (
                  <article className="document-card" key={doc.id}>
                    <div className="document-icon">
                      <FileText size={24} />
                    </div>
                    <div className="document-main">
                      <div className="shift-title">
                        <h3>{doc.type === 'license' ? 'Nursing license' : 'TB test result'}</h3>
                        <Badge status={expired ? 'expired' : doc.status} />
                      </div>
                      {admin && <p className="document-owner">{doc.nurseName}</p>}
                      <p>{doc.fileName || 'Verified demo record · no file attached'}</p>
                      <small>
                        {expired ? 'Expired' : 'Expires'} {displayDate(doc.expiresAt)}
                      </small>
                      <div className="document-actions">
                        {doc.hasFile && (
                          <a
                            download
                            href={`/api/credentials/${doc.id}/download`}
                            className="text-button"
                          >
                            <Download size={15} />
                            Download document
                          </a>
                        )}
                        {admin && doc.status === 'pending' && (
                          <>
                            <button
                              className="button compact primary"
                              disabled={review.isPending}
                              onClick={() => review.mutate({ id: doc.id, status: 'approved' })}
                            >
                              <Check size={15} />
                              Approve
                            </button>
                            <button
                              className="button compact secondary"
                              disabled={review.isPending}
                              onClick={() => review.mutate({ id: doc.id, status: 'rejected' })}
                            >
                              <X size={15} />
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        {!admin && (
          <aside>
            <section className="panel upload-panel">
              <span className="mini-icon">
                <Upload size={22} />
              </span>
              <h2>Add a document</h2>
              <p>Keep your record current with a new or renewed credential.</p>
              <form ref={formRef} className="form-stack" onSubmit={submit}>
                <Field label="Document type">
                  <select name="type">
                    <option value="license">Nursing license</option>
                    <option value="tb_test">TB test result</option>
                  </select>
                </Field>
                <Field label="Expiry date">
                  <input
                    type="date"
                    name="expiresAt"
                    required
                    data-testid={testIds.credentialExpiry}
                  />
                </Field>
                <Field label="Upload document" hint="PDF, PNG or JPEG. Maximum 4 MB.">
                  <input
                    type="file"
                    name="file"
                    accept="application/pdf,image/png,image/jpeg"
                    required
                    data-testid={testIds.credentialUpload}
                  />
                </Field>
                {localError && (
                  <p role="alert" className="inline-error">
                    {localError}
                  </p>
                )}
                <Submit busy={upload.isPending}>
                  <Upload size={16} />
                  Upload for review
                </Submit>
              </form>
            </section>
            <div className="privacy-note">
              <LockKeyhole size={19} />
              <p>
                Your documents are private. Only you and authorized administrators can access them.
              </p>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
