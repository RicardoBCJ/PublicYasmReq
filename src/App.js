import React, { useState, useEffect } from 'react';
import { 
  Upload, Send, FileText, CheckCircle, 
  AlertCircle, Loader2, Server, Hash,
  Copy, RefreshCw, Trash2 
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
  const [requestTreatmentId, setRequestTreatmentId] = useState(''); // NOVO
  const [customTreatmentId, setCustomTreatmentId] = useState(''); // NOVO - campo input
  const [searchId, setSearchId] = useState('');
  const [response, setResponse] = useState('');
  const [queryMode, setQueryMode] = useState('async'); // async ou sync

  // Carregar dados iniciais
  useEffect(() => {
    loadDocuments();
    loadModels();
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

  // Upload de documento
  const handleUpload = async () => {
    if (!uploadFile || !docType) {
      setUploadStatus('⚠️ Selecione um arquivo e tipo de documento');
      return;
    }

    setLoading(true);
    setUploadStatus('📤 Enviando...');

    try {
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
        setUploadStatus('✅ Upload realizado com sucesso!');
        loadDocuments();
        setUploadFile(null);
      } else {
        setUploadStatus('❌ Erro no upload');
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

    try {
      const res = await fetch(`${API_URL}/rag/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Question: question, RequestTreatmentId: customTreatmentId || undefined })
      });

      const data = await res.json();
      if (data.QueryId) {
        setQueryId(data.QueryId);
        setRequestTreatmentId(data.RequestTreatmentId); // NOVO - salvar RTI
        setResponse('📋 Requisição enviada! Use o ID para buscar a resposta.');
      }
    } catch (error) {
      setResponse('❌ Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Buscar resposta por ID
  const handleGetResponse = async () => {
    const id = searchId || queryId;
    if (!id) {
      setResponse('⚠️ Insira um ID válido');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/rag/status/${id}`);
      const data = await res.json();

      if (data.Result) {
        console.log(data.Result)
        if (data.RequestTreatmentId) {
          setRequestTreatmentId(data.RequestTreatmentId); // Atualizar RTI da resposta
        }
        // Se Result é HTML, vamos exibi-lo
        setResponse(
          <div dangerouslySetInnerHTML={{ __html: data.Result }} />
        );
      } else if (data.ProcessedAt === null) {
        console.log(data)
        setResponse('⏳ Ainda processando... Tente novamente em alguns segundos.');
      } else {
        setResponse('📭 Nenhum resultado encontrado.');
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
        body: JSON.stringify({ Question: question, RequestTreatmentId: customTreatmentId || undefined })
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

  // Copiar ID para clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('ID copiado!');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1> Yasmin RAG Interface</h1>
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

            {/* Modo de Consulta */}
            <div className="query-mode">
              <label>
                <input 
                  type="radio"
                  value="async"
                  checked={queryMode === 'async'}
                  onChange={(e) => setQueryMode(e.target.value)}
                />
                Assíncrono (RabbitMQ)
              </label>
              <label>
                <input 
                  type="radio"
                  value="sync"
                  checked={queryMode === 'sync'}
                  onChange={(e) => setQueryMode(e.target.value)}
                />
                Síncrono (Direto)
              </label>
            </div>

            {/* Input de Pergunta */}
            <div className="question-input">
              <textarea 
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Digite sua pergunta sobre as diretrizes..."
                rows={4}
                className="textarea"
              />

              <div className="custom-treatment-id">
                <input 
                  type="text"
                  value={customTreatmentId}
                  onChange={(e) => setCustomTreatmentId(e.target.value)}
                  placeholder="RequestTreatmentId customizado (opcional)"
                  className="input"
                  style={{marginTop: '10px'}}
                />
              </div>
              
              {queryMode === 'async' ? (
                <button 
                  onClick={handleSendQuestion}
                  disabled={loading}
                  className="btn btn-primary"
                >
                  {loading ? <Loader2 className="spin" /> : <Send />}
                  Enviar Pergunta
                </button>
              ) : (
                <button 
                  onClick={handleDirectQuery}
                  disabled={loading}
                  className="btn btn-primary"
                >
                  {loading ? <Loader2 className="spin" /> : <Send />}
                  Consultar
                </button>
              )}
            </div>

            {/* Request ID (para modo assíncrono) */}
            {queryMode === 'async' && queryId && (
              <div className="request-id-section">
                <h3>📋 Query ID</h3>
                <div className="id-display">
                  <code>{queryId}</code>
                  <button 
                    onClick={() => copyToClipboard(queryId)}
                    className="btn-icon"
                  >
                    <Copy size={16} />
                  </button>
                </div>

                {requestTreatmentId && (
                  <div style={{marginTop: '8px', fontSize: '0.9em', color: '#666'}}>
                    Treatment: {requestTreatmentId}
                  </div>
                )}
              </div>
            )}

            {/* Buscar por ID */}
            {queryMode === 'async' && (
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
                  <div>
                    <div style={{marginTop: '8px', fontSize: '0.9em', color: '#666'}}>
                      Treatment: {requestTreatmentId}
                    </div>
                    <div style={{marginTop: '8px', fontSize: '0.9em', color: '#666'}}>
                      Treatment: {queryId}
                    </div>
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
    </div>
  );
}

export default App;