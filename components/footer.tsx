export function Footer() {
  return (
    <footer className="bg-background border-t border-border/40 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <h3 className="text-lg font-semibold mb-4">DocuMind AI</h3>
            <p className="text-muted-foreground mb-4">
              Advanced AI-powered document analysis system. Process your documents with intelligent natural language
              queries and get instant, accurate answers with complete contextual understanding.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>📧 Email: theteambytehog@gmail.com</p>
              <p>🌐 Website: documind-ai.com</p>
              <p>📱 Support: Available 24/7</p>
            </div>
          </div>

          <div>
            <h4 className="text-md font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="/" className="hover:text-foreground transition-colors">
                  Home
                </a>
              </li>
              <li>
                <a href="/upload" className="hover:text-foreground transition-colors">
                  Upload Documents
                </a>
              </li>
              <li>
                <a href="/documents" className="hover:text-foreground transition-colors">
                  My Documents
                </a>
              </li>
              <li>
                <a href="/contact" className="hover:text-foreground transition-colors">
                  Contact Us
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-md font-semibold mb-4">Features</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>🤖 AI-Powered Analysis</li>
              <li>📄 Multi-format Support</li>
              <li>🔍 Semantic Search</li>
              <li>⚡ Real-time Results</li>
              <li>🔒 Secure Processing</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border/40 mt-8 pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            © 2024 DocuMind AI - Developed by <span className="font-semibold text-primary">The Byte Hog</span>. All
            rights reserved.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Powered by advanced AI technology for intelligent document understanding
          </p>
        </div>
      </div>
    </footer>
  )
}
