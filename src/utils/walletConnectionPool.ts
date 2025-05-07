// Simple connection pool to reuse wallet connections
class WalletConnectionPool {
  private static instance: WalletConnectionPool;
  private connections: Map<string, any> = new Map();
  private maxConnections: number = 3;
  
  private constructor() {}
  
  public static getInstance(): WalletConnectionPool {
    if (!WalletConnectionPool.instance) {
      WalletConnectionPool.instance = new WalletConnectionPool();
    }
    return WalletConnectionPool.instance;
  }
  
  public getConnection(key: string): any {
    return this.connections.get(key) || null;
  }
  
  public setConnection(key: string, connection: any): void {
    // If we're at max capacity, close the oldest connection
    if (this.connections.size >= this.maxConnections) {
      const oldestKey = this.connections.keys().next().value;
      
      // Add a type check to ensure oldestKey is defined
      if (oldestKey !== undefined) {
        const oldConnection = this.connections.get(oldestKey);
        
        if (oldConnection && oldConnection.disconnect) {
          oldConnection.removeAllListeners?.();
          oldConnection.disconnect();
        }
        
        this.connections.delete(oldestKey);
      }
    }
    
    this.connections.set(key, connection);
  }
  
  public closeConnection(key: string): void {
    const connection = this.connections.get(key);
    if (connection) {
      if (connection.removeAllListeners) {
        connection.removeAllListeners();
      }
      if (connection.disconnect) {
        connection.disconnect();
      }
      this.connections.delete(key);
    }
  }
  
  public closeAll(): void {
    this.connections.forEach(connection => {
      if (connection.removeAllListeners) {
        connection.removeAllListeners();
      }
      if (connection.disconnect) {
        connection.disconnect();
      }
    });
    this.connections.clear();
  }
}

export default WalletConnectionPool.getInstance();