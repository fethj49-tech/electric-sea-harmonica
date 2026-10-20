import SwiftUI
import WebKit

struct HarmonicaView: View {
    private var instrumentURL: URL? {
        Bundle.main.url(forResource: "index", withExtension: "html")
    }

    var body: some View {
        Group {
            if let instrumentURL {
                LocalInstrumentWebView(instrumentURL: instrumentURL)
                    .ignoresSafeArea()
            } else {
                VStack(spacing: 12) {
                    Text("Electric Sea Harmonica")
                        .font(.headline)
                    Text("The bundled instrument page is missing. Add index.html to Copy Bundle Resources and try again.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                }
                .padding(28)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(red: 7.0 / 255.0, green: 21.0 / 255.0, blue: 27.0 / 255.0))
            }
        }
    }
}

private struct LocalInstrumentWebView: UIViewRepresentable {
    let instrumentURL: URL

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 7.0 / 255.0, green: 21.0 / 255.0, blue: 27.0 / 255.0, alpha: 1.0)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.loadFileURL(instrumentURL, allowingReadAccessTo: instrumentURL.deletingLastPathComponent())
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}