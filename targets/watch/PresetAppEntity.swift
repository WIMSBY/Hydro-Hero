import AppIntents
import Foundation

// Watch-target counterpart to ios/PresetAppEntity.swift. Same shape and
// query contract, but the catalog is read from local UserDefaults on the
// watch (populated by WatchConnectivityManager.applyContext from the
// phone's WCSession push) instead of the phone's App Group — the watch
// can't read the phone's App Group storage.
@available(watchOS 9.0, *)
struct PresetAppEntity: AppEntity {
  let id: String
  let label: String
  let oz: Double
  let beverage: String

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Preset"

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(label)", subtitle: "\(beverageLabel)")
  }

  private var beverageLabel: String {
    switch beverage {
    case "water":  return "Water"
    case "coffee": return "Coffee"
    case "tea":    return "Tea"
    case "soda":   return "Soda"
    case "juice":  return "Juice"
    case "sports": return "Sports Drink"
    case "milk":   return "Milk"
    case "beer":   return "Beer"
    case "wine":   return "Wine"
    case "cocktail": return "Cocktail"
    default: return beverage.capitalized
    }
  }

  static var defaultQuery = PresetEntityQuery()
}

@available(watchOS 9.0, *)
struct PresetEntityQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [PresetAppEntity] {
    loadCatalog().filter { identifiers.contains($0.id) }
  }

  func suggestedEntities() async throws -> [PresetAppEntity] {
    loadCatalog()
  }

  private func loadCatalog() -> [PresetAppEntity] {
    guard let raw = UserDefaults.standard.array(forKey: "siri_catalog") as? [[String: Any]]
    else { return [] }
    return raw.compactMap { dict in
      guard let id = dict["id"] as? String,
            let label = dict["label"] as? String,
            let oz = dict["oz"] as? Double,
            let beverage = dict["beverage"] as? String
      else { return nil }
      return PresetAppEntity(id: id, label: label, oz: oz, beverage: beverage)
    }
  }
}
