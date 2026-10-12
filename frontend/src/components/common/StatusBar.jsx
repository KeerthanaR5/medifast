import React from 'react';

const StatusBar = ({ apiStatus, onRefreshStatus }) => {
  const getStatusConfig = () => {
    switch (apiStatus) {
      case 'connected':
        return {
          text: 'Backend: ✅ Connected',
          className: 'connected',
          bgColor: '#10b981'
        };
      case 'disconnected':
        return {
          text: 'Backend: ❌ Disconnected', 
          className: 'disconnected',
          bgColor: '#ef4444'
        };
      default:
        return {
          text: 'Backend: ⏳ Checking...',
          className: 'checking',
          bgColor: '#f59e0b'
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <div 
      className={`status-bar ${statusConfig.className}`}
      style={{ 
        backgroundColor: statusConfig.bgColor,
        padding: '8px 16px',
        color: 'white',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
    >
      <span className="status-text">{statusConfig.text}</span>
      {apiStatus === 'disconnected' && onRefreshStatus && (
        <button 
          className="refresh-btn"
          onClick={onRefreshStatus}
          title="Retry connection"
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          🔄
        </button>
      )}
    </div>
  );
};

export default StatusBar;
