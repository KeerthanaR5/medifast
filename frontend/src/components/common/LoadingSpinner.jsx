import React from 'react';

const LoadingSpinner = ({ size = 'medium', color = 'primary', className = '' }) => {
  const spinnerStyle = {
    display: 'inline-block',
    width: size === 'small' ? '20px' : size === 'large' ? '48px' : '32px',
    height: size === 'small' ? '20px' : size === 'large' ? '48px' : '32px',
    border: '3px solid rgba(102, 126, 234, 0.3)',
    borderRadius: '50%',
    borderTop: '3px solid #667eea',
    animation: 'spin 1s ease-in-out infinite'
  };

  return (
    <div className={className}>
      <div style={spinnerStyle} role="status" aria-label="Loading">
        <span style={{ position: 'absolute', width: '1px', height: '1px', padding: '0', margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: '0' }}>
          Loading...
        </span>
      </div>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LoadingSpinner;
