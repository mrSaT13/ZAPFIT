import React, { useState } from 'react';
import { Download, FileText, Table2, Loader } from 'lucide-react';
import { toast } from 'react-toastify';

const ExportReport = ({ accentColor }) => {
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [reportType, setReportType] = useState('comprehensive');

  const handleExport = async () => {
    if (!window.electronAPI?.exportReport) {
      toast.error('Функция экспорта недоступна');
      return;
    }

    setExporting(true);
    try {
      const result = await window.electronAPI.exportReport({ format: exportFormat, type: reportType });
      
      if (result.success) {
        toast.success(`Отчет сохранен: ${result.path}`);
      } else {
        toast.error(`Ошибка: ${result.error}`);
      }
    } catch (e) {
      console.error('Export error:', e);
      toast.error('Ошибка при экспорте отчета');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 shadow-lg">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg" style={{ backgroundColor: accentColor + '20' }}>
          <Download style={{ color: accentColor }} size={24} />
        </div>
        <h3 className="text-xl font-bold text-white">Экспорт отчета</h3>
      </div>

      <div className="space-y-4">
        {/* Report Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Тип отчета:</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              onClick={() => setReportType('comprehensive')}
              className={`p-3 rounded-lg border-2 transition-all ${
                reportType === 'comprehensive'
                  ? `border-[${accentColor}] bg-opacity-20`
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              style={reportType === 'comprehensive' ? { borderColor: accentColor, backgroundColor: accentColor + '15' } : {}}
            >
              <p className="font-medium text-white">📊 Полный отчет</p>
              <p className="text-xs text-gray-400">Все метрики и тренировки</p>
            </button>
            <button
              onClick={() => setReportType('fitness')}
              className={`p-3 rounded-lg border-2 transition-all ${
                reportType === 'fitness'
                  ? `border-[${accentColor}] bg-opacity-20`
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              style={reportType === 'fitness' ? { borderColor: accentColor, backgroundColor: accentColor + '15' } : {}}
            >
              <p className="font-medium text-white">💪 Фитнес-отчет</p>
              <p className="text-xs text-gray-400">CTL, ATL, TSB и рекомендации</p>
            </button>
            <button
              onClick={() => setReportType('monthly')}
              className={`p-3 rounded-lg border-2 transition-all ${
                reportType === 'monthly'
                  ? `border-[${accentColor}] bg-opacity-20`
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              style={reportType === 'monthly' ? { borderColor: accentColor, backgroundColor: accentColor + '15' } : {}}
            >
              <p className="font-medium text-white">📈 Месячный отчет</p>
              <p className="text-xs text-gray-400">Статистика за месяц</p>
            </button>
            <button
              onClick={() => setReportType('data')}
              className={`p-3 rounded-lg border-2 transition-all ${
                reportType === 'data'
                  ? `border-[${accentColor}] bg-opacity-20`
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              style={reportType === 'data' ? { borderColor: accentColor, backgroundColor: accentColor + '15' } : {}}
            >
              <p className="font-medium text-white">📥 Экспорт данных</p>
              <p className="text-xs text-gray-400">Сырые данные активностей</p>
            </button>
          </div>
        </div>

        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Формат:</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setExportFormat('pdf')}
              className={`p-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                exportFormat === 'pdf'
                  ? 'border-red-500 bg-red-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <FileText size={20} className={exportFormat === 'pdf' ? 'text-red-400' : 'text-gray-400'} />
              <span className="font-medium">PDF</span>
            </button>
            <button
              onClick={() => setExportFormat('excel')}
              className={`p-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                exportFormat === 'excel'
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <Table2 size={20} className={exportFormat === 'excel' ? 'text-green-400' : 'text-gray-400'} />
              <span className="font-medium">Excel</span>
            </button>
          </div>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{ backgroundColor: accentColor }}
          className="w-full py-3 rounded-lg text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {exporting ? (
            <>
              <Loader size={20} className="animate-spin" />
              Экспортирование...
            </>
          ) : (
            <>
              <Download size={20} />
              Экспортировать {exportFormat.toUpperCase()}
            </>
          )}
        </button>

        <div className="bg-black/20 p-3 rounded-lg text-xs text-gray-400 space-y-1">
          <p>💡 <strong>PDF:</strong> Красиво отформатированный отчет для печати и чтения</p>
          <p>💡 <strong>Excel:</strong> Данные в виде таблицы для дополнительного анализа</p>
          <p>💡 Отчеты будут сохранены в папке Загрузки</p>
        </div>
      </div>
    </div>
  );
};

export default ExportReport;
