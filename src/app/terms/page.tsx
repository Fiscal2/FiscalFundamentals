import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/legal-page';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of Service | Castling Financial',
  description: 'The terms and conditions governing your use of Castling Financial.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated={LEGAL.lastUpdated}>
      <LegalSection heading="1. Acceptance of terms">
        <p>
          By accessing or using {LEGAL.companyName} (the &quot;Service&quot;), you agree to be
          bound by these Terms of Service (the &quot;Terms&quot;). If you do not agree to these
          Terms, do not use the Service.
        </p>
      </LegalSection>

      <LegalSection heading="2. The Service">
        <p>
          The Service provides financial data, metrics, and visualizations derived from public
          company filings for informational and educational purposes only. The Service does not
          provide investment, financial, legal, or tax advice. See our{' '}
          <Link className="underline hover:text-white" href="/disclaimer">
            Disclaimer
          </Link>{' '}
          for important information about the limits of the data and our liability.
        </p>
      </LegalSection>

      <LegalSection heading="3. License and acceptable use">
        <p>
          We grant you a limited, non-exclusive, non-transferable, revocable license to access
          and use the Service for your personal, non-commercial use. You agree not to:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>use the Service for any unlawful purpose or in violation of these Terms;</li>
          <li>
            scrape, harvest, or systematically extract data from the Service, or place an
            unreasonable load on our infrastructure;
          </li>
          <li>
            attempt to gain unauthorized access to, interfere with, or disrupt the Service or
            its underlying systems;
          </li>
          <li>
            resell, redistribute, or commercially exploit the Service or its data without our
            prior written permission;
          </li>
          <li>
            remove, obscure, or alter any proprietary notices or use the Service in any way
            that misrepresents its source or accuracy.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Intellectual property">
        <p>
          The Service, including its design, branding, code, and original content, is owned by
          {' '}
          {LEGAL.companyName} and protected by applicable intellectual property laws. Underlying
          financial data is sourced from public filings (e.g., SEC EDGAR) and remains subject to
          its original terms.
        </p>
      </LegalSection>

      <LegalSection heading="5. Third-party data and services">
        <p>
          The Service relies on third-party data sources and infrastructure providers. We are
          not responsible for the accuracy, availability, or practices of any third party, and
          we are not affiliated with or endorsed by the SEC or any data source.
        </p>
      </LegalSection>

      <LegalSection heading="6. Disclaimer of warranties">
        <p>
          THE SERVICE AND ALL DATA ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE,&quot;
          WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
          TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
          ACCURACY, AND NON-INFRINGEMENT. We do not warrant that the Service will be
          uninterrupted, error-free, or that data will be accurate or complete.
        </p>
      </LegalSection>

      <LegalSection heading="7. Limitation of liability">
        <p>
          TO THE FULLEST EXTENT PERMITTED BY LAW, {LEGAL.companyName.toUpperCase()} AND ITS
          OPERATORS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR INVESTMENT LOSSES, ARISING OUT OF
          OR RELATED TO YOUR USE OF, OR INABILITY TO USE, THE SERVICE, WHETHER BASED ON
          WARRANTY, CONTRACT, TORT, OR ANY OTHER LEGAL THEORY.
        </p>
      </LegalSection>

      <LegalSection heading="8. Indemnification">
        <p>
          You agree to indemnify and hold harmless {LEGAL.companyName} and its operators from
          any claims, damages, liabilities, and expenses arising out of your use of the Service
          or your violation of these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="9. Changes to the Service or Terms">
        <p>
          We may modify or discontinue the Service, or update these Terms, at any time. Changes
          are effective when posted. Your continued use of the Service after changes are posted
          constitutes acceptance of the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="10. Governing law">
        <p>
          These Terms are governed by the laws of {LEGAL.governingLaw}, without regard to its
          conflict of laws principles.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact">
        <p>
          Questions about these Terms can be sent to{' '}
          <a className="underline hover:text-white" href={`mailto:${LEGAL.contactEmail}`}>
            {LEGAL.contactEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
