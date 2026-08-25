import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'ComplianceCopilot';

/** Generated at build time so pasting the link anywhere yields a real card. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: '#0B1120',
          padding: 80,
        }}
      >
        <div style={{ fontSize: 28, color: '#38BDF8', letterSpacing: 3 }}>
          COMPLIANCECOPILOT
        </div>
        <div style={{ fontSize: 60, color: '#F1F5F9', marginTop: 26, lineHeight: 1.15 }}>
          Read a data management plan the way a regulator would.
        </div>
        <div style={{ fontSize: 26, color: '#94A3B8', marginTop: 30, lineHeight: 1.4 }}>
          LangChain agents over a RAG pipeline — FERPA, HIPAA, GDPR, export control
        </div>
      </div>
    ),
    size,
  );
}
