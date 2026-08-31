import { Injectable } from '@nestjs/common';

/**
 * On Hostinger shared hosting, headless Chromium is not available.
 * PDF endpoints now return self-contained HTML. The browser opens it in a new
 * tab and `window.print()` (injected by the templates' document shell) produces
 * the printout — identical layout, no server-side browser required.
 *
 * ponytail: browser-print ceiling — upgrade to pdfkit/playwright on VPS if
 * server-generated PDFs for email attachments are ever needed.
 */
@Injectable()
export class PdfService {
  renderHtml(html: string): string {
    return html;
  }
}
