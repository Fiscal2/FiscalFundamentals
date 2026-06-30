import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/legal/legal-page';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Disclaimer | Castling Financial',
  description:
    'Castling Financial provides financial information for educational purposes only and does not provide investment advice.',
};

export default function DisclaimerPage() {
  return (
    <LegalPage title="Disclaimer" lastUpdated={LEGAL.lastUpdated}>
      <LegalSection heading="Not investment advice">
        <p>
          {LEGAL.companyName} (&quot;we,&quot; &quot;us,&quot; or &quot;the Service&quot;)
          provides financial data, metrics, and visualizations for informational and
          educational purposes only. Nothing on this site constitutes, or is intended to
          constitute, investment, financial, legal, tax, accounting, or other professional
          advice, or a recommendation, offer, or solicitation to buy, sell, or hold any
          security or to pursue any investment strategy. You should not treat any content on
          the Service as such.
        </p>
        <p>
          We are not a registered investment adviser, broker-dealer, or financial planner,
          and no fiduciary or advisory relationship is created by your use of the Service.
          Before making any financial decision, consult a qualified professional who is aware
          of your individual circumstances.
        </p>
      </LegalSection>

      <LegalSection heading="Data sources and accuracy">
        <p>
          Financial data displayed on the Service is derived primarily from public filings
          made available through the U.S. Securities and Exchange Commission (SEC) EDGAR
          system and is processed, standardized, and reformatted by automated systems. We are
          not affiliated with, endorsed by, or sponsored by the SEC.
        </p>
        <p>
          Data on the Service originates from third-party public filings and is processed by
          automated systems. While we work to keep our data accurate, source filings may
          themselves contain errors or be later restated, and automated processing can
          introduce inaccuracies. We therefore provide all data on an &quot;as is&quot; basis
          without warranty of accuracy, completeness, or timeliness, and you should verify any
          figure against the original source filing before relying on it.
        </p>
      </LegalSection>

      <LegalSection heading="No guarantees and your responsibility">
        <p>
          Past performance is not indicative of future results. All investments involve risk,
          including the possible loss of principal. Any decisions you make based on
          information from the Service are made at your own risk and are your sole
          responsibility. You are solely responsible for conducting your own due diligence.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the fullest extent permitted by law, {LEGAL.companyName} and its operators shall
          not be liable for any loss or damage of any kind arising out of or in connection
          with your use of, or reliance on, any content or data provided by the Service.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this disclaimer can be sent to{' '}
          <a className="underline hover:text-white" href={`mailto:${LEGAL.contactEmail}`}>
            {LEGAL.contactEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
