import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/legal/legal-page';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy | Castling Financial',
  description: 'How Castling Financial handles your data.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated={LEGAL.lastUpdated}>
      <LegalSection heading="Overview">
        <p>
          This Privacy Policy explains how {LEGAL.companyName} (&quot;we,&quot; &quot;us&quot;)
          handles information when you use our website (the &quot;Service&quot;). We aim to
          collect as little personal information as possible. The Service does not require an
          account, and we do not ask you to provide personal information to browse financial
          data.
        </p>
      </LegalSection>

      <LegalSection heading="Information we collect">
        <p>We may handle the following limited information:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong className="text-gray-200">Usage and device data:</strong> like most
            websites, our hosting and infrastructure providers may automatically log technical
            information such as your IP address, browser type, and pages requested, for
            security, reliability, and abuse prevention.
          </li>
          <li>
            <strong className="text-gray-200">Local browser storage:</strong> we store data
            locally in your browser (for example, cached financial results) to make the Service
            faster. This information stays on your device and is not transmitted to us as
            personal data. You can clear it at any time through your browser settings.
          </li>
          <li>
            <strong className="text-gray-200">Search queries:</strong> the ticker or company
            you look up is processed to retrieve the corresponding public filing data.
          </li>
        </ul>
        <p>
          We do not knowingly collect names, payment information, or other sensitive personal
          information.
        </p>
      </LegalSection>

      <LegalSection heading="How we use information">
        <p>
          We use the limited information described above to operate, maintain, secure, and
          improve the Service. We do not sell your personal information.
        </p>
      </LegalSection>

      <LegalSection heading="Third-party service providers">
        <p>
          We rely on third-party providers to deliver the Service, which may process technical
          data on our behalf, including:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>a hosting/CDN provider that serves the website and may log requests;</li>
          <li>a database provider that stores and serves the financial data;</li>
          <li>public data sources such as SEC EDGAR, from which filings originate.</li>
        </ul>
        <p>
          These providers have their own privacy practices, and we are not responsible for
          them.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          The Service does not use cookies for advertising or cross-site tracking. Any storage
          we use is limited to making the Service function and perform well, as described above.
        </p>
      </LegalSection>

      <LegalSection heading="Children's privacy">
        <p>
          The Service is not directed to children under 13, and we do not knowingly collect
          personal information from children.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. Changes are effective when
          posted, and the &quot;Last updated&quot; date above will reflect the latest revision.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this Privacy Policy can be sent to{' '}
          <a className="underline hover:text-white" href={`mailto:${LEGAL.contactEmail}`}>
            {LEGAL.contactEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
