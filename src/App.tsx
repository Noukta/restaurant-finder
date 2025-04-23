/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useRef } from "react";

// Define our interfaces
interface Restaurant {
	id: string;
	name: string;
	vicinity: string;
	rating?: number;
	user_ratings_total?: number;
	geometry: {
		location: {
			lat: number;
			lng: number;
		};
	};
	place_id: string;
	photos?: any[];
}

interface DetailedRestaurant extends Restaurant {
	formatted_address?: string;
	formatted_phone_number?: string;
	opening_hours?: {
		weekday_text: string[];
		open_now: boolean;
	};
	website?: string;
	url?: string;
	price_level?: number;
	reviews?: any[];
}

// Define Google Maps window interface
declare global {
	interface Window {
		google: any;
		initMap: () => void;
	}
}

export default function App() {
	const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
	const [selectedRestaurant, setSelectedRestaurant] =
		useState<DetailedRestaurant | null>(null);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [mapLoaded, setMapLoaded] = useState(false);

	// Refs
	const mapRef = useRef<HTMLDivElement>(null);
	const googleMapRef = useRef<any>(null);
	const markersRef = useRef<any[]>([]);
	const infoWindowRef = useRef<any>(null);
	const placesServiceRef = useRef<any>(null);
	const geocoderRef = useRef<any>(null);
	const searchBoxRef = useRef<any>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Current map center location
	const mapCenterRef = useRef<{ lat: number; lng: number } | null>(null);

	// Initialize Google Maps
	useEffect(() => {
		// Load Google Maps Script
		const loadGoogleMapsScript = () => {
			const API_KEY = "AIzaSyB41DRUbKWJHPxaFjMAwdrzWzbVKartNGg"; // Replace with your actual API key
			const script = document.createElement("script");
			script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places&callback=initMap`;
			script.async = true;
			script.defer = true;
			document.head.appendChild(script);

			window.initMap = initializeMap;
		};

		// Don't reload if already loaded
		if (!window.google) {
			loadGoogleMapsScript();
		} else {
			initializeMap();
		}

		return () => {
			// Cleanup function to remove the global callback
			window.initMap = () => {};
		};
	}, []);

	// Initialize the map
	const initializeMap = () => {
		if (!mapRef.current) return;

		// Default center (NYC)
		const defaultCenter = { lat: 32.2994, lng: -9.2372 };
		mapCenterRef.current = defaultCenter;

		// Create the map
		const mapOptions = {
			center: defaultCenter,
			zoom: 15,
			mapTypeControl: false,
			streetViewControl: false,
			fullscreenControl: true,
		};

		googleMapRef.current = new window.google.maps.Map(
			mapRef.current,
			mapOptions
		);
		infoWindowRef.current = new window.google.maps.InfoWindow();
		placesServiceRef.current = new window.google.maps.places.PlacesService(
			googleMapRef.current
		);
		geocoderRef.current = new window.google.maps.Geocoder();

		// Initialize the search box if the input exists
		if (searchInputRef.current) {
			searchBoxRef.current = new window.google.maps.places.SearchBox(
				searchInputRef.current
			);

			// Listen for the event fired when the user selects a prediction
			searchBoxRef.current.addListener("places_changed", () => {
				const places = searchBoxRef.current.getPlaces();

				if (places.length === 0) {
					return;
				}

				// For each place, get the location.
				const bounds = new window.google.maps.LatLngBounds();

				places.forEach((place: any) => {
					if (!place.geometry || !place.geometry.location) {
						console.log("Returned place contains no geometry");
						return;
					}

					// Update current location
					mapCenterRef.current = {
						lat: place.geometry.location.lat(),
						lng: place.geometry.location.lng(),
					};

					// If the place has a geometry, then present it on a map.
					if (place.geometry.viewport) {
						bounds.union(place.geometry.viewport);
					} else {
						bounds.extend(place.geometry.location);
					}
				});

				googleMapRef.current.fitBounds(bounds);
				googleMapRef.current.setZoom(15); // Adjust zoom level after search

				// Find restaurants in this area
				findNearbyRestaurants();
			});
		}

		// Get user location initially
		getUserLocation();

		setMapLoaded(true);
	};

	// Get the user's current location
	const getUserLocation = () => {
		setLoading(true);
		setSelectedRestaurant(null);

		if (navigator.geolocation) {
			navigator.geolocation.getCurrentPosition(
				(position) => {
					const userPosition = {
						lat: position.coords.latitude,
						lng: position.coords.longitude,
					};
					mapCenterRef.current = userPosition;

					// Center map
					if (googleMapRef.current) {
						googleMapRef.current.setCenter(userPosition);

						// Add user location marker
						new window.google.maps.Marker({
							position: userPosition,
							map: googleMapRef.current,
							title: "Your Location",
							icon: {
								path: window.google.maps.SymbolPath.CIRCLE,
								scale: 10,
								fillColor: "#4285F4",
								fillOpacity: 1,
								strokeColor: "#FFFFFF",
								strokeWeight: 2,
							},
						});

						// Find restaurants automatically
						findNearbyRestaurants();
					}
				},
				(error) => {
					console.error("Error getting location:", error);
					setError(
						"Couldn't get your location. Please use the search to find a location."
					);
					setLoading(false);
				}
			);
		} else {
			setError(
				"Your browser doesn't support geolocation. Please use the search."
			);
			setLoading(false);
		}
	};

	// Find restaurants near the current map center
	const findNearbyRestaurants = () => {
		if (!placesServiceRef.current || !mapCenterRef.current) {
			setError("Map services aren't initialized yet.");
			setLoading(false);
			return;
		}

		setLoading(true);
		setSelectedRestaurant(null);
		clearMarkers();

		const request = {
			location: mapCenterRef.current,
			radius: 500,
			type: "restaurant",
		};

		placesServiceRef.current.nearbySearch(
			request,
			(results: Restaurant[], status: string) => {
				if (
					status ===
						window.google.maps.places.PlacesServiceStatus.OK &&
					results
				) {
					setRestaurants(results);
					results.forEach(createMarker);
					setLoading(false);
				} else {
					setError("Couldn't find restaurants nearby.");
					setRestaurants([]);
					setLoading(false);
				}
			}
		);
	};

	// Create a marker for a restaurant
	const createMarker = (place: Restaurant) => {
		if (!googleMapRef.current) return;

		const marker = new window.google.maps.Marker({
			map: googleMapRef.current,
			position: place.geometry.location,
			title: place.name,
			animation: window.google.maps.Animation.DROP,
		});

		markersRef.current.push(marker);

		marker.addListener("click", () => {
			getRestaurantDetails(place.place_id);
		});
	};

	// Get detailed information about a restaurant
	const getRestaurantDetails = (placeId: string) => {
		if (!placesServiceRef.current) return;

		setLoading(true);

		placesServiceRef.current.getDetails(
			{
				placeId: placeId,
				fields: [
					"name",
					"place_id",
					"formatted_address",
					"formatted_phone_number",
					"geometry",
					"rating",
					"user_ratings_total",
					"opening_hours",
					"website",
					"url",
					"vicinity",
					"price_level",
					"reviews",
					"photos",
				],
			},
			(placeResult: DetailedRestaurant, status: string) => {
				setLoading(false);

				if (
					status ===
						window.google.maps.places.PlacesServiceStatus.OK &&
					placeResult
				) {
					setSelectedRestaurant(placeResult);

					// Center the map on this restaurant
					if (
						googleMapRef.current &&
						placeResult.geometry &&
						placeResult.geometry.location
					) {
						googleMapRef.current.setCenter(
							placeResult.geometry.location
						);
						googleMapRef.current.setZoom(18); // Zoom in closer to the restaurant
					}

					// Update info window
					if (infoWindowRef.current) {
						const content = createInfoWindowContent(placeResult);
						infoWindowRef.current.setContent(content);

						// Find the marker
						const markerIndex = markersRef.current.findIndex(
							(marker) =>
								marker.getPosition().lat() ===
									placeResult.geometry.location.lat &&
								marker.getPosition().lng() ===
									placeResult.geometry.location.lng
						);

						if (markerIndex !== -1) {
							infoWindowRef.current.open(
								googleMapRef.current,
								markersRef.current[markerIndex]
							);
						}
					}
				} else {
					setError("Couldn't load restaurant details.");
				}
			}
		);
	};

	// Clear all markers from the map
	const clearMarkers = () => {
		markersRef.current.forEach((marker) => {
			marker.setMap(null);
		});
		markersRef.current = [];
	};

	// Create the HTML content for the info window
	const createInfoWindowContent = (place: DetailedRestaurant) => {
		const rating = place.rating ? place.rating : "No rating";
		const totalRatings = place.user_ratings_total
			? `(${place.user_ratings_total} reviews)`
			: "";

		return `
      <div class="info-window">
        <h3>${place.name}</h3>
        <p>${place.vicinity || place.formatted_address || ""}</p>
        <p>Rating: <strong>${rating}</strong> ${totalRatings}</p>
        <p>
          <a href="${place.url}" target="_blank">View on Google Maps</a>
          ${
				place.place_id
					? `| <a href="https://search.google.com/local/writereview?placeid=${place.place_id}" target="_blank">Leave a Review</a>`
					: ""
			}
        </p>
      </div>
    `;
	};

	// Handle restaurant selection from the list
	const handleRestaurantClick = (restaurant: Restaurant) => {
		getRestaurantDetails(restaurant.place_id);
	};

	// Get review link for a restaurant
	const getReviewLink = (placeId: string) => {
		return `https://search.google.com/local/writereview?placeid=${placeId}`;
	};

	// Handle search input change
	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchQuery(e.target.value);
	};

	// Handle search form submission
	const handleSearchSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (!searchQuery.trim() || !geocoderRef.current) return;

		setLoading(true);
		setError(null);

		geocoderRef.current.geocode(
			{ address: searchQuery },
			(results: any[], status: string) => {
				if (status === "OK" && results[0]) {
					const location = results[0].geometry.location;
					mapCenterRef.current = {
						lat: location.lat(),
						lng: location.lng(),
					};

					googleMapRef.current.setCenter(location);
					googleMapRef.current.setZoom(15);

					findNearbyRestaurants();
				} else {
					setError("Couldn't find that location. Please try again.");
					setLoading(false);
				}
			}
		);
	};

	// Format price level
	const formatPriceLevel = (priceLevel?: number) => {
		if (priceLevel === undefined) return "Price not available";

		const priceSymbols = [];
		for (let i = 0; i < priceLevel; i++) {
			priceSymbols.push("$");
		}
		return priceSymbols.join("") || "$";
	};

	// Format ratings as stars
	const formatRatingStars = (rating?: number) => {
		if (!rating) return "No rating available";

		// Round to nearest half
		const roundedRating = Math.round(rating * 2) / 2;
		const fullStars = Math.floor(roundedRating);
		const halfStar = roundedRating % 1 !== 0;

		let stars = "";

		// Full stars
		for (let i = 0; i < fullStars; i++) {
			stars += "★";
		}

		// Half star
		if (halfStar) {
			stars += "½";
		}

		// Empty stars
		const emptyStars = 5 - Math.ceil(roundedRating);
		for (let i = 0; i < emptyStars; i++) {
			stars += "☆";
		}

		return `${stars} (${rating})`;
	};

	return (
		<div className="flex flex-col h-screen">
			<header className="bg-blue-600 text-white p-4">
				<h1 className="text-2xl font-bold mb-2">Restaurant Finder</h1>
				<form onSubmit={handleSearchSubmit} className="flex">
					<input
						ref={searchInputRef}
						type="text"
						value={searchQuery}
						onChange={handleSearchChange}
						placeholder="Search for a location"
						className="flex-1 px-4 py-2 rounded-l text-black"
						aria-label="Search for a location"
					/>
					<button
						type="submit"
						className="bg-blue-800 px-4 py-2 rounded-r hover:bg-blue-900"
						disabled={loading}
					>
						Search
					</button>
				</form>
			</header>

			<div className="flex flex-1 overflow-hidden">
				{/* Main content - Map or Restaurant Detail */}
				<div className="flex-1 flex flex-col">
					{selectedRestaurant ? (
						<div className="flex-1 overflow-y-auto p-6 bg-white">
							<div className="mb-4">
								<button
									onClick={() => setSelectedRestaurant(null)}
									className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded mb-4"
								>
									Back to Map
								</button>
							</div>

							<h2 className="text-3xl font-bold mb-2">
								{selectedRestaurant.name}
							</h2>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
								<div>
									<p className="text-gray-800 mb-4">
										{selectedRestaurant.formatted_address ||
											selectedRestaurant.vicinity}
									</p>

									<div className="mb-4">
										<div className="text-lg font-semibold">
											Rating
										</div>
										<div className="text-yellow-500 text-xl">
											{formatRatingStars(
												selectedRestaurant.rating
											)}
											{selectedRestaurant.user_ratings_total && (
												<span className="text-gray-600 text-sm ml-2">
													(
													{
														selectedRestaurant.user_ratings_total
													}{" "}
													reviews)
												</span>
											)}
										</div>
									</div>

									{selectedRestaurant.price_level !==
										undefined && (
										<div className="mb-4">
											<div className="text-lg font-semibold">
												Price Range
											</div>
											<div>
												{formatPriceLevel(
													selectedRestaurant.price_level
												)}
											</div>
										</div>
									)}

									{selectedRestaurant.formatted_phone_number && (
										<div className="mb-4">
											<div className="text-lg font-semibold">
												Phone
											</div>
											<div>
												{
													selectedRestaurant.formatted_phone_number
												}
											</div>
										</div>
									)}

									{selectedRestaurant.opening_hours && (
										<div className="mb-4">
											<div className="text-lg font-semibold">
												Hours
											</div>
											<div className="text-sm">
												{selectedRestaurant
													.opening_hours.open_now && (
													<span className="bg-green-100 text-green-800 px-2 py-1 rounded inline-block mb-2">
														Open Now
													</span>
												)}
												<ul className="list-none">
													{selectedRestaurant.opening_hours.weekday_text?.map(
														(day, index) => (
															<li
																key={index}
																className="mb-1"
															>
																{day}
															</li>
														)
													)}
												</ul>
											</div>
										</div>
									)}

									<div className="flex space-x-4 mt-6">
										{selectedRestaurant.website && (
											<a
												href={
													selectedRestaurant.website
												}
												target="_blank"
												rel="noopener noreferrer"
												className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded"
											>
												Visit Website
											</a>
										)}

										<a
											href={getReviewLink(
												selectedRestaurant.place_id
											)}
											target="_blank"
											rel="noopener noreferrer"
											className="bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 rounded"
										>
											Leave a Review
										</a>

										{selectedRestaurant.url && (
											<a
												href={selectedRestaurant.url}
												target="_blank"
												rel="noopener noreferrer"
												className="bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded"
											>
												View on Google Maps
											</a>
										)}
									</div>
								</div>

								<div>
									{selectedRestaurant.reviews &&
										selectedRestaurant.reviews.length >
											0 && (
											<div>
												<h3 className="text-xl font-bold mb-3">
													Reviews
												</h3>
												<div className="space-y-4">
													{selectedRestaurant.reviews
														.slice(0, 3)
														.map(
															(review, index) => (
																<div
																	key={index}
																	className="bg-gray-50 p-4 rounded"
																>
																	<div className="flex items-center mb-2">
																		<div className="font-medium">
																			{
																				review.author_name
																			}
																		</div>
																		<div className="text-yellow-500 ml-2">
																			{
																				review.rating
																			}{" "}
																			★
																		</div>
																	</div>
																	<p className="text-sm text-gray-700">
																		{
																			review.text
																		}
																	</p>
																	<div className="text-xs text-gray-500 mt-1">
																		{new Date(
																			review.time *
																				1000
																		).toLocaleDateString()}
																	</div>
																</div>
															)
														)}
												</div>
											</div>
										)}
								</div>
							</div>
						</div>
					) : (
						<div ref={mapRef} className="flex-1"></div>
					)}
				</div>

				{/* Sidebar - Only show when map is displayed */}
				{selectedRestaurant ? (
					<div>
						<button
							className="bg-gray-300 hover:bg-gray-400 text-black py-1 px-3 rounded mb-4"
							onClick={() => setSelectedRestaurant(null)}
						>
							← Back to List
						</button>

						<h2 className="text-xl font-bold mb-2">
							{selectedRestaurant.name}
						</h2>
						<p className="text-sm text-gray-600 mb-2">
							{selectedRestaurant.formatted_address ||
								selectedRestaurant.vicinity}
						</p>
						<p className="text-yellow-500 text-sm mb-2">
							{formatRatingStars(selectedRestaurant.rating)} (
							{selectedRestaurant.user_ratings_total || 0}{" "}
							reviews)
						</p>
						{selectedRestaurant.formatted_phone_number && (
							<p className="text-sm mb-2">
								📞 {selectedRestaurant.formatted_phone_number}
							</p>
						)}
						{selectedRestaurant.website && (
							<a
								href={selectedRestaurant.website}
								target="_blank"
								rel="noopener noreferrer"
								className="text-blue-600 underline text-sm block mb-2"
							>
								Visit Website
							</a>
						)}
						{selectedRestaurant.opening_hours && (
							<div className="text-xs text-gray-700 mb-2">
								{selectedRestaurant.opening_hours.weekday_text.map(
									(line, i) => (
										<div key={i}>{line}</div>
									)
								)}
							</div>
						)}
					</div>
				) : (
					<div className="w-80 bg-gray-100 p-4 overflow-y-auto">
						<div className="bg-white p-4 rounded shadow mb-4">
							<button
								className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded w-full mb-2"
								onClick={findNearbyRestaurants}
								disabled={loading || !mapLoaded}
							>
								{loading ? "Loading..." : "Refresh Restaurants"}
							</button>

							<button
								className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded w-full"
								onClick={getUserLocation}
								disabled={loading || !mapLoaded}
							>
								Use My Location
							</button>
						</div>

						{error && (
							<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
								{error}
							</div>
						)}

						<div>
							<h2 className="font-bold text-lg mb-2">
								Nearby Restaurants
							</h2>

							{loading ? (
								<p className="text-gray-500">
									Loading restaurants...
								</p>
							) : restaurants.length === 0 ? (
								<p className="text-gray-500">
									No restaurants found nearby.
								</p>
							) : (
								<ul className="space-y-2">
									{restaurants.map((restaurant) => (
										<li
											key={restaurant.place_id}
											className="bg-white p-3 rounded shadow cursor-pointer hover:bg-blue-50 transition-colors"
											onClick={() =>
												handleRestaurantClick(
													restaurant
												)
											}
										>
											<div className="font-bold">
												{restaurant.name}
											</div>
											<div className="text-sm text-gray-600">
												{restaurant.vicinity}
											</div>
											<div className="text-sm mt-1">
												{restaurant.rating
													? `${
															restaurant.rating
													  } ⭐ (${
															restaurant.user_ratings_total ||
															0
													  })`
													: "No rating"}
											</div>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
