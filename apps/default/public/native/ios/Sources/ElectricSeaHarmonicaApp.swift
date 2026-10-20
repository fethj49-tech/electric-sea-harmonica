import SwiftUI

@main
struct ElectricSeaHarmonicaApp: App {
    var body: some Scene {
        WindowGroup {
            HarmonicaView()
                .preferredColorScheme(.dark)
        }
    }
}