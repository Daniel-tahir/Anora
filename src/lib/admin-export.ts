import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV(data: Record<string, any>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${filename}.csv`);
}

export function exportExcel(data: Record<string, any>[], filename: string, sheetName = "Sheet1") {
  if (!data.length) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportPDF(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 20);
  doc.setFontSize(8);
  doc.text(
    `Generated ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
    14,
    28,
  );

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 34,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 0, 0] },
  });

  doc.save(`${filename}.pdf`);
}

export function generateInvoicePDF(data: {
  invoiceNumber: string;
  orderNumber: string | null;
  customerName: string;
  customerEmail: string;
  issuedAt: string | null;
  items: { productName: string; quantity: number; unitPrice: number; totalPrice: number }[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  shippingAmount: number;
  totalAmount: number;
}) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(22);
  doc.text("INVOICE", pageWidth - 14, 20, { align: "right" });

  doc.setFontSize(10);
  doc.text(`INV-${data.invoiceNumber}`, pageWidth - 14, 28, { align: "right" });
  doc.text(`Order: ${data.orderNumber || "N/A"}`, pageWidth - 14, 34, { align: "right" });
  doc.text(
    `Date: ${data.issuedAt ? new Date(data.issuedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A"}`,
    pageWidth - 14,
    40,
    { align: "right" },
  );

  doc.setFontSize(11);
  doc.text("ANORA", 14, 48);
  doc.setFontSize(8);
  doc.text("Elegance Crafted For Every Moment", 14, 54);

  doc.setFontSize(10);
  doc.text("Bill To:", 14, 66);
  doc.setFontSize(9);
  doc.text(data.customerName, 14, 73);
  doc.text(data.customerEmail, 14, 79);

  const tableHeaders = ["Item", "Qty", "Unit Price", "Total"];
  const tableRows = data.items.map((item) => [
    item.productName,
    item.quantity.toString(),
    `$${Number(item.unitPrice).toFixed(2)}`,
    `$${Number(item.totalPrice).toFixed(2)}`,
  ]);

  autoTable(doc, {
    head: [tableHeaders],
    body: tableRows,
    startY: 90,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 30, halign: "right" },
      3: { cellWidth: 30, halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 8;

  const summaryX = pageWidth - 80;
  doc.setFontSize(9);
  doc.text("Subtotal:", summaryX, finalY);
  doc.text(`$${Number(data.subtotal).toFixed(2)}`, pageWidth - 14, finalY, { align: "right" });

  let y = finalY + 6;
  doc.text("Tax:", summaryX, y);
  doc.text(`$${Number(data.taxAmount).toFixed(2)}`, pageWidth - 14, y, { align: "right" });

  if (data.discountAmount > 0) {
    y += 6;
    doc.text("Discount:", summaryX, y);
    doc.text(`-$${Number(data.discountAmount).toFixed(2)}`, pageWidth - 14, y, { align: "right" });
  }

  y += 6;
  doc.text("Shipping:", summaryX, y);
  doc.text(`$${Number(data.shippingAmount).toFixed(2)}`, pageWidth - 14, y, { align: "right" });

  y += 8;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Total:", summaryX, y);
  doc.text(`$${Number(data.totalAmount).toFixed(2)}`, pageWidth - 14, y, { align: "right" });

  doc.save(`invoice-${data.invoiceNumber}.pdf`);
}
