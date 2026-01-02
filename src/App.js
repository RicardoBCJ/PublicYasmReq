import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Send, FileText, CheckCircle, 
  AlertCircle, Loader2, Server, Hash,
  Copy, RefreshCw, Trash2, File
} from 'lucide-react';
import './App.css';

const API_URL = 'http://localhost:5000/api';
const PYTHON_URL = 'http://localhost:5001';

function App() {
  // Estados principais
  const [documents, setDocuments] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  
  // Estados do upload
  const [uploadFile, setUploadFile] = useState(null);
  const [docType, setDocType] = useState('DUT');
  const [uploadStatus, setUploadStatus] = useState('');
  
  // Estados da consulta
  const [question, setQuestion] = useState('');
  const [queryId, setQueryId] = useState('');
  const [requestTreatmentId, setRequestTreatmentId] = useState('');
  const [customTreatmentId, setCustomTreatmentId] = useState('');
  const [searchId, setSearchId] = useState('');
  const [response, setResponse] = useState('');
  const [queryMode, setQueryMode] = useState('async'); // async ou sync
  
  // NOVOS Estados para PDF
  const [uploadType, setUploadType] = useState('text'); // 'text' | 'pdf-async' | 'pdf-sync'
  const [pdfFile, setPdfFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);  // NOVO - para drag and drop
  const [pollingStatus, setPollingStatus] = useState('');
  
  // Ref para controlar polling
  const pollingRef = useRef(null);

  // Carregar dados iniciais
  useEffect(() => {
    loadDocuments();
    loadModels();
    
    // Cleanup polling on unmount
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, []);

  // Funções de carregamento
  const loadDocuments = async () => {
    try {
      const res = await fetch(`${PYTHON_URL}/documents`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
    }
  };

  const loadModels = async () => {
    try {
      const res = await fetch(`${PYTHON_URL}/models`);
      const data = await res.json();
      setModels(data.models || []);
    } catch (error) {
      console.error('Erro ao carregar modelos:', error);
    }
  };

  // Upload de documento (texto OU PDF)
  const handleUpload = async () => {
    if (!uploadFile || !docType) {
      setUploadStatus('⚠️ Selecione um arquivo e tipo de documento');
      return;
    }

    setLoading(true);
    setUploadStatus('📤 Enviando...');

    try {
      const isPdf = uploadFile.name.toLowerCase().endsWith('.pdf');
      
      if (isPdf) {
        // ✅ PDF: Usar /process/pdf com FormData
        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('doc_type', docType);
        
        const res = await fetch(`${PYTHON_URL}/process/pdf`, {
          method: 'POST',
          body: formData  // NÃO colocar Content-Type header!
        });

        if (res.ok) {
          const data = await res.json();
          setUploadStatus(`✅ PDF processado! ${data.page_count} páginas, ${data.chunks_added} chunks extraídos`);
          loadDocuments();
          setUploadFile(null);
        } else {
          const error = await res.json();
          setUploadStatus('❌ Erro: ' + (error.error || 'Falha no processamento'));
        }
      } else {
        // Texto: Usar /process (comportamento original)
        const text = await uploadFile.text();
        const res = await fetch(`${PYTHON_URL}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: text,
            doc_type: docType
          })
        });

        if (res.ok) {
          const data = await res.json();
          setUploadStatus(`✅ Texto processado! ${data.optimized_chunks} chunks`);
          loadDocuments();
          setUploadFile(null);
        } else {
          setUploadStatus('❌ Erro no upload');
        }
      }
    } catch (error) {
      setUploadStatus('❌ Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Deletar documento
  const handleDelete = async (docId) => {
    if (!window.confirm('Deletar este documento?')) return;
    
    try {
      await fetch(`${PYTHON_URL}/documents/${docId}`, { method: 'DELETE' });
      loadDocuments();
    } catch (error) {
      console.error('Erro ao deletar:', error);
    }
  };

  // Enviar pergunta (Modo Assíncrono - Via RabbitMQ)
  const handleSendQuestion = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setResponse('');
    setQueryId('');
    setPollingStatus('');

    try {
      const res = await fetch(`${API_URL}/rag/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          Question: question, 
          RequestTreatmentId: customTreatmentId || undefined 
        })
      });

      const data = await res.json();
      if (data.QueryId) {
        setQueryId(data.QueryId);
        setRequestTreatmentId(data.RequestTreatmentId);
        setResponse('📋 Requisição enviada! Use o ID para buscar a resposta.');
      }
    } catch (error) {
      setResponse('❌ Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ================== NOVAS FUNÇÕES DE PDF ==================

  // PDF via C# API (Assíncrono)
  const handlePdfUploadAsync = async () => {
    if (!pdfFile) {
      setResponse('⚠️ Selecione um arquivo PDF');
      return;
    }

    setLoading(true);
    setResponse('');
    setQueryId('');
    setPollingStatus('📤 Enviando PDF...');

    const formData = new FormData();
    formData.append('file', pdfFile);
    if (customTreatmentId) {
      formData.append('requestTreatmentId', customTreatmentId);
    }

    try {
      const res = await fetch(`${API_URL}/pdf/analyze`, {
        method: 'POST',
        body: formData // NÃO colocar Content-Type header
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      
      if (data.QueryId) {
        setQueryId(data.QueryId);
        setRequestTreatmentId(data.RequestTreatmentId);
        setResponse(
          <div className="pdf-upload-info">
            <p>📄 <strong>{data.FileName}</strong></p>
            <p>📦 Tamanho: {(data.FileSize / 1024).toFixed(2)} KB</p>
            <p>🔄 Processando... aguarde o resultado.</p>
          </div>
        );
        
        // Iniciar polling automático
        pollForResult(data.QueryId);
      }
    } catch (error) {
      setResponse('❌ Erro: ' + error.message);
      setPollingStatus('');
    } finally {
      setLoading(false);
    }
  };

  // Polling para resultado do PDF assíncrono
  const pollForResult = async (queryIdToPoll) => {
    const maxAttempts = 60; // 120 segundos (60 x 2s)
    let attempts = 0;

    const poll = async () => {
      try {
        setPollingStatus(`🔄 Verificando resultado... (${attempts + 1}/${maxAttempts})`);
        
        const res = await fetch(`${API_URL}/pdf/status/${queryIdToPoll}`);
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        
        const data = await res.json();

        if (data.ProcessedAt || data.Status === 'Completed') {
          // Resultado pronto
          setPollingStatus('✅ Processamento concluído!');
          if (data.RequestTreatmentId) {
            setRequestTreatmentId(data.RequestTreatmentId);
          }
          setResponse(
            <div>
              <div className="success-badge">✅ Análise Completa</div>
              <div dangerouslySetInnerHTML={{ __html: data.Result }} />
            </div>
          );
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          pollingRef.current = setTimeout(poll, 2000); // Tentar novamente em 2s
        } else {
          setPollingStatus('⏱️ Timeout - tente buscar manualmente pelo ID');
          setResponse(
            <div>
              <p>⏱️ O processamento está demorando mais que o esperado.</p>
              <p>Use o Query ID para buscar o resultado manualmente:</p>
              <code>{queryIdToPoll}</code>
            </div>
          );
        }
      } catch (error) {
        setPollingStatus('❌ Erro no polling: ' + error.message);
      }
    };

    poll();
  };

  // PDF via Python (Síncrono)
  const handlePdfUploadSync = async () => {
    if (!pdfFile) {
      setResponse('⚠️ Selecione um arquivo PDF');
      return;
    }

    setLoading(true);
    setResponse('');
    setPollingStatus('📤 Enviando PDF para análise direta...');

    const formData = new FormData();
    formData.append('file', pdfFile);

    try {
      const res = await fetch(`${PYTHON_URL}/query/pdf`, {
        method: 'POST',
        body: formData // NÃO colocar Content-Type header
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setPollingStatus('');

      if (data.result) {
        setResponse(
          <div>
            <div className="pdf-info-banner">
              📄 {data.page_count || '?'} página(s) | 
              Método: {data.extraction_method || 'auto'}
            </div>
            <div dangerouslySetInnerHTML={{ __html: data.result }} />
          </div>
        );
      } else if (data.error) {
        setResponse('❌ Erro: ' + data.error);
      }
    } catch (error) {
      setResponse('❌ Erro: ' + error.message);
      setPollingStatus('');
    } finally {
      setLoading(false);
    }
  };

  // ================== FIM NOVAS FUNÇÕES ==================

  // Buscar resposta por ID
  const handleGetResponse = async () => {
    const id = searchId || queryId;
    if (!id) {
      setResponse('⚠️ Insira um ID válido');
      return;
    }

    setLoading(true);
    try {
      // Tentar primeiro o endpoint de RAG
      let res = await fetch(`${API_URL}/rag/status/${id}`);
      let data = await res.json();

      // Se não encontrou no RAG, tentar no PDF
      if (!data.Result && !data.ProcessedAt) {
        res = await fetch(`${API_URL}/pdf/status/${id}`);
        data = await res.json();
      }

      if (data.Result) {
        console.log(data.Result);
        if (data.RequestTreatmentId) {
          setRequestTreatmentId(data.RequestTreatmentId);
        }
        setResponse(
          <div dangerouslySetInnerHTML={{ __html: data.Result }} />
        );
      } else if (data.ProcessedAt === null) {
        console.log(data);
        setResponse('⏳ Ainda processando... Tente novamente em alguns segundos.');
      } else {
        setResponse('🔭 Nenhum resultado encontrado.');
      }
    } catch (error) {
      setResponse('❌ Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Consulta direta (Modo Síncrono - Python direto)
  const handleDirectQuery = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setResponse('');

    try {
      const endpoint = docType === 'DUT' ? '/query/dut' : '/query/full';
      const res = await fetch(`${PYTHON_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question: question, 
          RequestTreatmentId: customTreatmentId || undefined 
        })
      });

      const data = await res.json();
      if (data.result) {
        setResponse(
          <div dangerouslySetInnerHTML={{ __html: data.result }} />
        );
      }
    } catch (error) {
      setResponse('❌ Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Handler unificado para envio
  const handleSubmit = () => {
    if (uploadType === 'text') {
      if (queryMode === 'async') {
        handleSendQuestion();
      } else {
        handleDirectQuery();
      }
    } else if (uploadType === 'pdf-async') {
      handlePdfUploadAsync();
    } else if (uploadType === 'pdf-sync') {
      handlePdfUploadSync();
    }
  };

  // Verificar se pode enviar
  const canSubmit = () => {
    if (loading) return false;
    if (uploadType === 'text') {
      return question.trim().length > 0;
    } else {
      return pdfFile !== null;
    }
  };

  // Copiar ID para clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('ID copiado!');
  };

  // Limpar seleção de PDF
  const clearPdfSelection = () => {
    setPdfFile(null);
    // Limpar o input file
    const fileInput = document.getElementById('pdf-input');
    if (fileInput) fileInput.value = '';
  };

  // ================== DRAG AND DROP HANDLERS ==================
  
  // Quando arquivo é arrastado sobre a área
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  // Quando arquivo sai da área
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  // Quando arquivo é solto na área
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Verifica se é PDF
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setPdfFile(file);
      } else {
        alert('Por favor, selecione apenas arquivos PDF');
      }
    }
  };

  // ================== FIM DRAG AND DROP ==================

  return (
    <div className="app">
      <header className="app-header">
        <h1>🏥 Yasmin RAG Interface</h1>
        <div className="status-bar">
          <span className={models.length > 0 ? 'status-ok' : 'status-error'}>
            <Server size={16} />
            Modelos: {models.length}
          </span>
          <span className={documents.length > 0 ? 'status-ok' : 'status-warn'}>
            <FileText size={16} />
            Docs: {documents.length}
          </span>
        </div>
      </header>

      <div className="tabs">
        <button 
          className={activeTab === 'upload' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('upload')}
        >
          📤 Upload
        </button>
        <button 
          className={activeTab === 'query' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('query')}
        >
          💬 Consulta
        </button>
        <button 
          className={activeTab === 'docs' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('docs')}
        >
          📚 Documentos
        </button>
      </div>

      <main className="app-main">
        {/* TAB UPLOAD */}
        {activeTab === 'upload' && (
          <div className="upload-section">
            <h2>Upload de Documentos</h2>
            
            <div className="upload-controls">
              <select 
                value={docType} 
                onChange={(e) => setDocType(e.target.value)}
                className="select-input"
              >
                <option value="DUT">DUT - Diretrizes</option>
                <option value="DUT_MANUAL">Manual DUT</option>
                <option value="REPORT">Relatórios</option>
                <option value="OTHER">Outros</option>
              </select>

              <input 
                type="file"
                onChange={(e) => setUploadFile(e.target.files[0])}
                accept=".txt,.pdf,.doc,.docx"
                className="file-input"
              />

              <button 
                onClick={handleUpload}
                disabled={loading}
                className="btn btn-primary"
              >
                {loading ? <Loader2 className="spin" /> : <Upload />}
                Enviar
              </button>
            </div>

            {uploadStatus && (
              <div className="status-message">
                {uploadStatus}
              </div>
            )}

            {/* Lista de Modelos */}
            <div className="models-section">
              <h3>🎯 Modelos Disponíveis</h3>
              {models.length > 0 ? (
                <ul className="models-list">
                  {models.map((model, idx) => (
                    <li key={idx}>
                      <CheckCircle size={16} className="icon-success" />
                      {model.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="warning">⚠️ Nenhum modelo carregado</p>
              )}
            </div>
          </div>
        )}

        {/* TAB CONSULTA */}
        {activeTab === 'query' && (
          <div className="query-section">
            <h2>Consulta RAG</h2>

            {/* Tipo de Input (Texto ou PDF) */}
            <div className="upload-type-selector">
              <h4>📎 Tipo de Entrada</h4>
              <div className="radio-group">
                <label className={uploadType === 'text' ? 'radio-label active' : 'radio-label'}>
                  <input 
                    type="radio"
                    value="text"
                    checked={uploadType === 'text'}
                    onChange={(e) => setUploadType(e.target.value)}
                  />
                  📝 Texto
                </label>
                <label className={uploadType === 'pdf-async' ? 'radio-label active' : 'radio-label'}>
                  <input 
                    type="radio"
                    value="pdf-async"
                    checked={uploadType === 'pdf-async'}
                    onChange={(e) => setUploadType(e.target.value)}
                  />
                  📄 PDF (Assíncrono)
                </label>
                <label className={uploadType === 'pdf-sync' ? 'radio-label active' : 'radio-label'}>
                  <input 
                    type="radio"
                    value="pdf-sync"
                    checked={uploadType === 'pdf-sync'}
                    onChange={(e) => setUploadType(e.target.value)}
                  />
                  📄 PDF (Síncrono)
                </label>
              </div>
            </div>

            {/* Modo de Consulta (apenas para texto) */}
            {uploadType === 'text' && (
              <div className="query-mode">
                <h4>🔄 Modo de Processamento</h4>
                <div className="radio-group">
                  <label className={queryMode === 'async' ? 'radio-label active' : 'radio-label'}>
                    <input 
                      type="radio"
                      value="async"
                      checked={queryMode === 'async'}
                      onChange={(e) => setQueryMode(e.target.value)}
                    />
                    Assíncrono (RabbitMQ)
                  </label>
                  <label className={queryMode === 'sync' ? 'radio-label active' : 'radio-label'}>
                    <input 
                      type="radio"
                      value="sync"
                      checked={queryMode === 'sync'}
                      onChange={(e) => setQueryMode(e.target.value)}
                    />
                    Síncrono (Direto)
                  </label>
                </div>
              </div>
            )}

            {/* Input de Texto (quando texto selecionado) */}
            {uploadType === 'text' && (
              <div className="question-input">
                <textarea 
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Digite sua pergunta sobre as diretrizes..."
                  rows={4}
                  className="textarea"
                />
              </div>
            )}

            {/* Input de PDF (quando PDF selecionado) - COM DRAG AND DROP */}
            {(uploadType === 'pdf-async' || uploadType === 'pdf-sync') && (
              <div 
                className={`pdf-input-section ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <h4>📄 Selecione o PDF</h4>
                
                {/* Área de Drag and Drop */}
                <div 
                  className={`drop-zone ${isDragging ? 'drop-zone-active' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <p className="drop-zone-text">
                    {isDragging 
                      ? '📥 Solte o arquivo aqui!' 
                      : '🖱️ Arraste um PDF aqui ou clique no botão abaixo'}
                  </p>
                </div>
                
                <div className="pdf-input-controls">
                  <input 
                    id="pdf-input"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setPdfFile(e.target.files[0])}
                    className="file-input"
                  />
                  {pdfFile && (
                    <div className="pdf-selected">
                      <File size={16} />
                      <span className="file-name">{pdfFile.name}</span>
                      <span className="file-size">
                        ({(pdfFile.size / 1024).toFixed(2)} KB)
                      </span>
                      <button 
                        onClick={clearPdfSelection}
                        className="btn-icon small"
                        title="Remover arquivo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <p className="hint">
                  {uploadType === 'pdf-async' 
                    ? '⚡ Processamento assíncrono via RabbitMQ - ideal para PDFs grandes'
                    : '🔄 Processamento síncrono direto - resposta imediata'}
                </p>
              </div>
            )}

            {/* Campo de Treatment ID customizado */}
            <div className="custom-treatment-id">
              <input 
                type="text"
                value={customTreatmentId}
                onChange={(e) => setCustomTreatmentId(e.target.value)}
                placeholder="RequestTreatmentId customizado (opcional)"
                className="input"
              />
            </div>

            {/* Botão de Envio */}
            <div className="submit-section">
              <button 
                onClick={handleSubmit}
                disabled={!canSubmit()}
                className="btn btn-primary btn-large"
              >
                {loading ? <Loader2 className="spin" /> : <Send />}
                {uploadType === 'text' ? 'Enviar Pergunta' : 'Analisar PDF'}
              </button>
            </div>

            {/* Status de Polling */}
            {pollingStatus && (
              <div className="polling-status">
                {pollingStatus}
              </div>
            )}

            {/* Request ID (para modos assíncronos) */}
            {(uploadType === 'text' && queryMode === 'async' || uploadType === 'pdf-async') && queryId && (
              <div className="request-id-section">
                <h3>📋 Query ID</h3>
                <div className="id-display">
                  <code>{queryId}</code>
                  <button 
                    onClick={() => copyToClipboard(queryId)}
                    className="btn-icon"
                    title="Copiar ID"
                  >
                    <Copy size={16} />
                  </button>
                </div>

                {requestTreatmentId && (
                  <div className="treatment-id-display">
                    Treatment ID: <code>{requestTreatmentId}</code>
                  </div>
                )}
              </div>
            )}

            {/* Buscar por ID */}
            {(uploadType === 'text' && queryMode === 'async' || uploadType === 'pdf-async') && (
              <div className="search-section">
                <h3>🔍 Buscar Resposta por ID</h3>
                <div className="search-controls">
                  <input 
                    type="text"
                    value={searchId}
                    onChange={(e) => setSearchId(e.target.value)}
                    placeholder="Cole o Query ID aqui..."
                    className="input"
                  />
                  <button 
                    onClick={handleGetResponse}
                    disabled={loading}
                    className="btn btn-secondary"
                  >
                    {loading ? <Loader2 className="spin" /> : <Hash />}
                    Buscar
                  </button>
                </div>
              </div>
            )}

            {/* Resposta */}
            {response && (
              <div className="response-section">
                <h3>💡 Resposta</h3>
                <div className="response-content">
                  {response}
                </div>

                {requestTreatmentId && (
                  <div className="response-meta">
                    <div className="meta-item">
                      <strong>Treatment ID:</strong> {requestTreatmentId}
                    </div>
                    {queryId && (
                      <div className="meta-item">
                        <strong>Query ID:</strong> {queryId}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB DOCUMENTOS */}
        {activeTab === 'docs' && (
          <div className="docs-section">
            <div className="docs-header">
              <h2>Documentos Carregados</h2>
              <button 
                onClick={loadDocuments}
                className="btn-icon"
                title="Atualizar lista"
              >
                <RefreshCw size={20} />
              </button>
            </div>

            {documents.length > 0 ? (
              <div className="docs-grid">
                {documents.map((doc) => (
                  <div key={doc.id} className="doc-card">
                    <div className="doc-info">
                      <FileText size={20} />
                      <div>
                        <p className="doc-name">
                          {doc.metadata?.name || `Doc-${doc.id.slice(0, 8)}`}
                        </p>
                        <span className="doc-type">{doc.metadata?.doc_type}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDelete(doc.id)}
                      className="btn-icon delete"
                      title="Deletar documento"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">Nenhum documento carregado ainda.</p>
            )}
          </div>
        )}
      </main>

      {/* Footer com informações */}
      <footer className="app-footer">
        <div className="footer-info">
          <span>API C#: {API_URL}</span>
          <span>|</span>
          <span>Python: {PYTHON_URL}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;