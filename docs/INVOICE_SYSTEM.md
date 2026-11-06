# Invoice system

`Invoice` stores a unique invoice number, private document path, legal seller fields and amount in paise. Issued model records reject updates. `render_invoice_pdf` uses ReportLab, the NammaPros wordmark, burgundy accent, service/address details and line items. `GET /api/v1/bookings/{id}/invoice/` downloads only an existing issued invoice owned by the signed-in customer. Booking detail shows the link only when an issued document exists.

No invoice is issued automatically. Legal seller identity, address, tax registration decision, numbering policy, tax treatment, service completion trigger and credit note policy have not been approved. The renderer was exercised with sample data and its single page was visually inspected. This does not validate a legal invoice. Do not create `Invoice(status=ISSUED)` until those inputs and an issuance service are implemented. The PDF file store must be private and never mapped to a public static URL.
