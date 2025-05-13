declare module '@mono.co/connect.js' {
  interface MonoConnectOptions {
    key: string;
    onClose?: () => void;
    onLoad?: () => void;
    onSuccess: (data: { code: string }) => void;
    reference?: string;
    onEvent?: (eventName: string, data: any) => void;
  }

  class MonoConnect {
    setup() {
      throw new Error('Method not implemented.');
    }
    constructor(options: MonoConnectOptions);
    open: () => void;
    close: () => void;
    reauthorise: (reauth_token: string) => void;
  }

  export default MonoConnect;
}