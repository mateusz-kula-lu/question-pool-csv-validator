import { Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { validateCsvString, CsvFieldValidationError, parseCsvLineWithErrors } from '../utilities/csv';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MatButtonModule, MatIcon, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('question_pool_validator');

  showResults = false;
  results: CsvFieldValidationError[] = [];
  csvLines: string[] = [];
  header: string[] = [];
  parsedRows: string[][] = [];
  originalFieldsRows: string[][] = [];
  hasErrors = false;

  // Soft, transparent colors for up to 10 fields
  private fieldColors = [
    'rgba(255, 99, 132, 0.18)',
    'rgba(54, 162, 235, 0.18)',
    'rgba(255, 206, 86, 0.18)',
    'rgba(75, 192, 192, 0.18)',
    'rgba(153, 102, 255, 0.18)',
    'rgba(255, 159, 64, 0.18)',
    'rgba(199, 199, 199, 0.18)',
    'rgba(255, 99, 255, 0.18)',
    'rgba(99, 255, 132, 0.18)',
    'rgba(99, 132, 255, 0.18)',
  ];

  handleCsvContent(content: string) {
    this.csvLines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    this.header = this.csvLines[0]
      ? parseCsvLineWithErrors(this.csvLines[0]).row
      : [];
    this.results = validateCsvString(content);
    this.parsedRows = this.csvLines.map(line =>
      parseCsvLineWithErrors(line, this.header).row
    );
    this.originalFieldsRows = this.csvLines.map(line =>
      parseCsvLineWithErrors(line, this.header).originalFields
    );
    this.showResults = true;
    this.hasErrors = this.results.filter(r => r.error).length > 0
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = () => {
      const content = reader.result as string;
      this.handleCsvContent(content);
    };

    reader.readAsText(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    const dropZone = document.querySelector('.file-drop-zone');
    if (dropZone) dropZone.classList.add('dragover');
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    const dropZone = document.querySelector('.file-drop-zone');
    if (dropZone) dropZone.classList.remove('dragover');
    if (!event.dataTransfer || event.dataTransfer.files.length === 0) return;
    const file = event.dataTransfer.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      this.handleCsvContent(content);
    };
    reader.readAsText(file);
  }

  closeResults() {
    this.showResults = false;
    this.results = [];
    this.csvLines = [];
    this.header = [];
    this.parsedRows = [];
    this.originalFieldsRows = [];
    this.hasErrors = false;
  }

  getIssuesForLine(line: number): CsvFieldValidationError[] {
    return this.results.filter(err => err.line === line);
  }

  hasFieldError(lineNumber: number, fieldIndex: number): boolean {
    return this.results.some(
      err => err.line === lineNumber && err.field === fieldIndex + 1
    );
  }

  getRawFieldSections(i: number): { text: string, color: string }[] {
    const fields = this.originalFieldsRows[i + 1] || [];
    return fields.map((text, idx) => ({
      text,
      color: this.fieldColors[idx % this.fieldColors.length]
    }));
  }
}