// ─────────────────────────────────────────
// ROADGUARD — ONE TAP SOS BUTTON
// Uses FREE OpenStreetMap API
// No API key needed! No payment!
// ─────────────────────────────────────────

import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ─────────────────────────────────────────
// ⚠️ REPLACE WITH YOUR REAL NUMBERS
// ─────────────────────────────────────────
const EMERGENCY_CONTACTS = [
  '+91xxxxxxxxxx', // Replace with real number
  '+91xxxxxxxxxx', // Replace with real number(family)
];

const EMERGENCY_NUMBER = '112';

// ─────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────
export default function HomeScreen() {

  const [status, setStatus] = useState('Ready — Tap SOS for Emergency Help');
  const [isSending, setIsSending] = useState(false);
  const [lastLocation, setLastLocation] = useState(null);
  const [nearbyServices, setNearbyServices] = useState({
    hospital: null,
    police: null,
  });

  // ── GET GPS LOCATION ──
  const getLocation = async () => {
    const { status: permStatus } =
      await Location.requestForegroundPermissionsAsync();

    if (permStatus !== 'granted') {
      Alert.alert(
        'Permission Needed',
        'Please allow location access for SOS to work.'
      );
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return location.coords;
  };

  // ── FIND NEAREST PLACE USING FREE OPENSTREETMAP ──
  const findNearestPlace = async (latitude, longitude, type) => {
    try {
      const amenity = type === 'hospital' ? 'hospital' : 'police';

      const query = `
        [out:json][timeout:10];
        (
          node["amenity"="${amenity}"](around:5000,${latitude},${longitude});
          way["amenity"="${amenity}"](around:5000,${latitude},${longitude});
        );
        out body center 1;
      `;

      const url = 'https://overpass-api.de/api/interpreter';

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

      const data = await response.json();

      if (data.elements && data.elements.length > 0) {
        const place = data.elements[0];

        const placeLat = place.lat || place.center?.lat;
        const placeLng = place.lon || place.center?.lon;

        if (!placeLat || !placeLng) return null;

        const distance = calculateDistance(
          latitude, longitude,
          placeLat, placeLng
        );

        const name = place.tags?.name ||
          (type === 'hospital' ? 'Nearby Hospital' : 'Nearby Police Station');
        const phone = place.tags?.phone ||
          place.tags?.['contact:phone'] ||
          (type === 'hospital' ? '108' : '100');
        const address = place.tags?.['addr:full'] ||
          place.tags?.['addr:street'] ||
          'Nearby location';

        return {
          name,
          address,
          distance: `${distance.toFixed(1)} km`,
          latitude: placeLat,
          longitude: placeLng,
          phone,
        };
      }

      return null;

    } catch (error) {
      console.log('OpenStreetMap error:', error);
      return null;
    }
  };

  // ── CALCULATE DISTANCE ──
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // ── OPEN PHONE DIALER ──
  const callEmergency = async () => {
    const phoneUrl = `tel:${EMERGENCY_NUMBER}`;
    const canCall = await Linking.canOpenURL(phoneUrl);
    if (canCall) {
      await Linking.openURL(phoneUrl);
    } else {
      Alert.alert('Cannot Call', 'This device cannot make phone calls.');
    }
  };

  // ─────────────────────────────────────────
  // ── BUILD THE SOS MESSAGE ──
  // ─────────────────────────────────────────
  const buildSOSMessage = (latitude, longitude, hospital, police) => {
    const myLocationLink = `https://maps.google.com/?q=${latitude},${longitude}`;

    const hospitalText = hospital
      ? `🏥 NEAREST HOSPITAL:\n` +
        `${hospital.name} (${hospital.distance})\n` +
        `📞 ${hospital.phone}\n` +
        `🗺 https://maps.google.com/?q=${hospital.latitude},${hospital.longitude}`
      : `🏥 NEAREST HOSPITAL:\nNot found nearby`;

    const policeText = police
      ? `🚓 NEAREST POLICE STATION:\n` +
        `${police.name} (${police.distance})\n` +
        `📞 ${police.phone}\n` +
        `🗺 https://maps.google.com/?q=${police.latitude},${police.longitude}`
      : `🚓 NEAREST POLICE STATION:\nNot found nearby`;

    return (
      `🚨 EMERGENCY SOS ALERT 🚨\n\n` +
      `Road accident reported! Please send help immediately!\n\n` +
      `📍 VICTIM LOCATION:\n${myLocationLink}\n\n` +
      `${hospitalText}\n\n` +
      `${policeText}\n\n` +
      `Please respond urgently!\n` +
      `Sent via RoadGuard Emergency App`
    );
  };

  // ─────────────────────────────────────────
  // ── SEND SMS TO EMERGENCY CONTACTS ──
  // (Friends & family who will help the victim)
  // ─────────────────────────────────────────
  const sendSMSToContacts = async (latitude, longitude, hospital, police) => {
    const message = buildSOSMessage(latitude, longitude, hospital, police);

    const isAvailable = await SMS.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('SMS Not Available', 'Cannot send SMS on this device.');
      return 'unavailable';
    }

    const { result } = await SMS.sendSMSAsync(EMERGENCY_CONTACTS, message);
    return result;
  };

  // ─────────────────────────────────────────
  // ── SEND SMS TO NEAREST HOSPITAL ──
  // Sends alert directly to the hospital's phone number
  // ─────────────────────────────────────────
  const sendSMSToHospital = async (latitude, longitude, hospital, police) => {
    if (!hospital || !hospital.phone) return 'no_number';

    // Clean the phone number — remove spaces, dashes, etc.
    const hospitalPhone = hospital.phone.replace(/[\s\-().]/g, '');

    const message =
      `🚨 EMERGENCY ALERT — HOSPITAL REQUIRED 🚨\n\n` +
      `A road accident has occurred nearby. Patient may need immediate medical attention.\n\n` +
      `📍 ACCIDENT LOCATION:\n` +
      `https://maps.google.com/?q=${latitude},${longitude}\n\n` +
      `📏 Distance from your hospital: ${hospital.distance}\n\n` +
      `🚓 Police also alerted: ${police ? police.name : 'Not found'}\n\n` +
      `Please dispatch ambulance immediately!\n` +
      `Sent via RoadGuard Emergency App`;

    const isAvailable = await SMS.isAvailableAsync();
    if (!isAvailable) return 'unavailable';

    try {
      const { result } = await SMS.sendSMSAsync([hospitalPhone], message);
      return result;
    } catch (error) {
      console.log('Hospital SMS error:', error);
      return 'error';
    }
  };

  // ─────────────────────────────────────────
  // ── SEND SMS TO NEAREST POLICE STATION ──
  // Sends alert directly to the police station's phone number
  // ─────────────────────────────────────────
  const sendSMSToPolice = async (latitude, longitude, hospital, police) => {
    if (!police || !police.phone) return 'no_number';

    // Clean the phone number
    const policePhone = police.phone.replace(/[\s\-().]/g, '');

    const message =
      `🚨 EMERGENCY ALERT — POLICE ASSISTANCE REQUIRED 🚨\n\n` +
      `A road accident has occurred in your area. Immediate police assistance needed.\n\n` +
      `📍 ACCIDENT LOCATION:\n` +
      `https://maps.google.com/?q=${latitude},${longitude}\n\n` +
      `📏 Distance from your station: ${police.distance}\n\n` +
      `🏥 Nearest hospital alerted: ${hospital ? hospital.name : 'Not found'}\n\n` +
      `Please dispatch officers immediately!\n` +
      `Sent via RoadGuard Emergency App`;

    const isAvailable = await SMS.isAvailableAsync();
    if (!isAvailable) return 'unavailable';

    try {
      const { result } = await SMS.sendSMSAsync([policePhone], message);
      return result;
    } catch (error) {
      console.log('Police SMS error:', error);
      return 'error';
    }
  };

  // ─────────────────────────────────────────
  // ── MAIN SOS HANDLER ──
  // ─────────────────────────────────────────
  const handleSOS = async () => {
    if (isSending) return;

    Alert.alert(
      '🚨 Send SOS?',
      'This will:\n✅ Get your GPS location\n✅ Find nearest hospital & police\n✅ Call 112\n✅ SMS your emergency contacts\n✅ SMS nearest hospital directly\n✅ SMS nearest police station directly',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'YES, SEND SOS!',
          style: 'destructive',
          onPress: async () => {
            setIsSending(true);

            try {
              // Step 1: Get GPS
              setStatus('📍 Getting your location...');
              const coords = await getLocation();
              if (!coords) {
                setStatus('❌ Location failed. Try again.');
                setIsSending(false);
                return;
              }
              setLastLocation(coords);

              // Step 2: Find hospital
              setStatus('🏥 Finding nearest hospital...');
              const hospital = await findNearestPlace(
                coords.latitude, coords.longitude, 'hospital'
              );

              // Step 3: Find police
              setStatus('🚓 Finding nearest police station...');
              const police = await findNearestPlace(
                coords.latitude, coords.longitude, 'police'
              );

              setNearbyServices({ hospital, police });

              // Step 4: Call 112
              setStatus('📞 Opening emergency call to 112...');
              await callEmergency();

              // Step 5: SMS to your emergency contacts (family/friends)
              setStatus('💬 Sending SMS to your emergency contacts...');
              await sendSMSToContacts(
                coords.latitude, coords.longitude, hospital, police
              );

              // Step 6: SMS directly to nearest hospital
              if (hospital && hospital.phone) {
                setStatus(`🏥 Sending SMS to ${hospital.name}...`);
                await sendSMSToHospital(
                  coords.latitude, coords.longitude, hospital, police
                );
              } else {
                setStatus('🏥 Hospital number not found, skipping...');
              }

              // Step 7: SMS directly to nearest police station
              if (police && police.phone) {
                setStatus(`🚓 Sending SMS to ${police.name}...`);
                await sendSMSToPolice(
                  coords.latitude, coords.longitude, hospital, police
                );
              } else {
                setStatus('🚓 Police number not found, skipping...');
              }

              // Done!
              setStatus('✅ SOS Sent to ALL! Help is coming!');

              Alert.alert(
                '✅ SOS Sent!',
                `Messages sent to:\n` +
                `✅ Your emergency contacts\n` +
                `${hospital?.phone ? `✅ ${hospital.name}` : `⚠️ Hospital SMS skipped (no number)`}\n` +
                `${police?.phone ? `✅ ${police.name}` : `⚠️ Police SMS skipped (no number)`}\n\n` +
                `112 call was opened. Help is on the way!`
              );

            } catch (error) {
              setStatus('❌ Error! Call 112 directly!');
              Alert.alert(
                'SOS Error',
                'Something went wrong. Please call 112 directly.'
              );
            }

            setIsSending(false);
          },
        },
      ]
    );
  };

  // ── SCREEN UI ──
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.appName}>🚨 RoadGuard</Text>
          <Text style={styles.tagline}>Emergency Response Platform</Text>
          <View style={styles.freeBadge} />
        </View>

        {/* STATUS BAR */}
        <View style={styles.statusBox}>
          {isSending && (
            <ActivityIndicator
              color="#FF2D2D"
              size="small"
              style={{ marginBottom: 6 }}
            />
          )}
          <Text style={styles.statusText}>{status}</Text>
        </View>

        {/* BIG RED SOS BUTTON */}
        <View style={styles.sosWrapper}>
          <View style={styles.sosRingOuter} />
          <View style={[styles.sosRing, isSending && styles.sosRingActive]} />
          <TouchableOpacity
            style={[styles.sosButton, isSending && styles.sosButtonDisabled]}
            onPress={handleSOS}
            activeOpacity={0.8}
          >
            <Text style={styles.sosIcon}>🆘</Text>
            <Text style={styles.sosButtonText}>
              {isSending ? 'SENDING...' : 'SOS'}
            </Text>
            <Text style={styles.sosSubText}>
              {isSending ? 'Please wait...' : 'Tap for Emergency Help'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* INFO BOX */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>When you tap SOS:</Text>
          <Text style={styles.infoItem}>📍  Gets your GPS location</Text>
          <Text style={styles.infoItem}>🏥  Finds nearest hospital (FREE)</Text>
          <Text style={styles.infoItem}>🚓  Finds nearest police (FREE)</Text>
          <Text style={styles.infoItem}>📞  Opens dialer → calls 112</Text>
          <Text style={styles.infoItem}>💬  SMS to your emergency contacts</Text>
          <Text style={styles.infoItem}>🏥  SMS directly to nearest hospital</Text>
          <Text style={styles.infoItem}>🚓  SMS directly to nearest police</Text>
          <Text style={styles.infoItem}>🗺️  Google Maps links included</Text>
        </View>

        {/* NEAREST HOSPITAL CARD */}
        {nearbyServices.hospital && (
          <View style={styles.serviceBox}>
            <Text style={styles.serviceTitle}>🏥 Nearest Hospital Found</Text>
            <Text style={styles.serviceName}>{nearbyServices.hospital.name}</Text>
            <Text style={styles.serviceDetail}>📍 {nearbyServices.hospital.address}</Text>
            <Text style={styles.serviceDetail}>📏 {nearbyServices.hospital.distance} away</Text>
            <Text style={styles.serviceDetail}>📞 {nearbyServices.hospital.phone}</Text>
            <TouchableOpacity
              style={styles.callButton}
              onPress={() => Linking.openURL(`tel:${nearbyServices.hospital.phone}`)}
            >
              <Text style={styles.callButtonText}>📞 Call Hospital Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() =>
                Linking.openURL(
                  `https://maps.google.com/?q=${nearbyServices.hospital.latitude},${nearbyServices.hospital.longitude}`
                )
              }
            >
              <Text style={styles.navButtonText}>🗺 Open in Google Maps</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* NEAREST POLICE CARD */}
        {nearbyServices.police && (
          <View style={styles.policeBox}>
            <Text style={styles.serviceTitle}>🚓 Nearest Police Station Found</Text>
            <Text style={styles.serviceName}>{nearbyServices.police.name}</Text>
            <Text style={styles.serviceDetail}>📍 {nearbyServices.police.address}</Text>
            <Text style={styles.serviceDetail}>📏 {nearbyServices.police.distance} away</Text>
            <Text style={styles.serviceDetail}>📞 {nearbyServices.police.phone}</Text>
            <TouchableOpacity
              style={styles.callButton}
              onPress={() => Linking.openURL(`tel:${nearbyServices.police.phone}`)}
            >
              <Text style={styles.callButtonText}>📞 Call Police Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() =>
                Linking.openURL(
                  `https://maps.google.com/?q=${nearbyServices.police.latitude},${nearbyServices.police.longitude}`
                )
              }
            >
              <Text style={styles.navButtonText}>🗺 Open in Google Maps</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* MY LOCATION CARD */}
        {lastLocation && (
          <View style={styles.locationBox}>
            <Text style={styles.locationTitle}>📍 Your Location</Text>
            <Text style={styles.locationText}>Lat: {lastLocation.latitude.toFixed(6)}</Text>
            <Text style={styles.locationText}>Lng: {lastLocation.longitude.toFixed(6)}</Text>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(
                  `https://maps.google.com/?q=${lastLocation.latitude},${lastLocation.longitude}`
                )
              }
            >
              <Text style={styles.locationLink}>🗺 Open My Location in Google Maps</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* EMERGENCY CONTACTS */}
        <View style={styles.contactsBox}>
          <Text style={styles.contactsTitle}>👥 Emergency Contacts</Text>
          {EMERGENCY_CONTACTS.map((contact, index) => (
            <View key={index} style={styles.contactItem}>
              <Text style={styles.contactText}>Contact {index + 1}: {contact}</Text>
            </View>
          ))}
          <Text style={styles.contactsHint}>
            Edit EMERGENCY_CONTACTS at top of this file
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── STYLES ──
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },
  scroll: { alignItems: 'center', padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginTop: 20, marginBottom: 20 },
  appName: { fontSize: 28, fontWeight: '800', color: '#F0F0FF', letterSpacing: -0.5 },
  tagline: { fontSize: 13, color: '#9999BB', marginTop: 4 },
  freeBadge: {
    backgroundColor: 'rgba(0,217,126,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,217,126,0.4)',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginTop: 10,
  },
  statusBox: {
    backgroundColor: '#1A1A2E', borderRadius: 12, padding: 14,
    width: '100%', marginBottom: 30, borderWidth: 1,
    borderColor: '#2A2A4A', alignItems: 'center',
  },
  statusText: { color: '#F0F0FF', fontSize: 14, fontWeight: '500', textAlign: 'center' },
  sosWrapper: {
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 40, width: 240, height: 240,
  },
  sosRingOuter: {
    position: 'absolute', width: 235, height: 235,
    borderRadius: 118, borderWidth: 1, borderColor: 'rgba(255,45,45,0.15)',
  },
  sosRing: {
    position: 'absolute', width: 210, height: 210,
    borderRadius: 105, borderWidth: 2, borderColor: 'rgba(255,45,45,0.3)',
  },
  sosRingActive: { borderColor: 'rgba(255,45,45,0.8)' },
  sosButton: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: '#FF2D2D', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF2D2D', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 30, elevation: 20,
  },
  sosButtonDisabled: { backgroundColor: '#882020', shadowOpacity: 0.2 },
  sosIcon: { fontSize: 36, marginBottom: 4 },
  sosButtonText: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: 3 },
  sosSubText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 4, letterSpacing: 0.5 },
  infoBox: {
    backgroundColor: '#0E0E1C', borderRadius: 14, padding: 18,
    width: '100%', marginBottom: 16, borderWidth: 1, borderColor: '#1E1E3A',
  },
  infoTitle: {
    color: '#9999BB', fontSize: 12, fontWeight: '600',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
  },
  infoItem: { color: '#F0F0FF', fontSize: 14, paddingVertical: 5, lineHeight: 20 },
  serviceBox: {
    backgroundColor: '#0A1A0A', borderRadius: 14, padding: 18,
    width: '100%', marginBottom: 16, borderWidth: 1, borderColor: '#1A3A1A',
  },
  policeBox: {
    backgroundColor: '#0A0A1A', borderRadius: 14, padding: 18,
    width: '100%', marginBottom: 16, borderWidth: 1, borderColor: '#1A1A3A',
  },
  serviceTitle: {
    color: '#9999BB', fontSize: 11, fontWeight: '600',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
  },
  serviceName: { color: '#F0F0FF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  serviceDetail: { color: '#AAAACC', fontSize: 13, paddingVertical: 3, lineHeight: 20 },
  callButton: {
    backgroundColor: 'rgba(255,45,45,0.15)', borderWidth: 1,
    borderColor: 'rgba(255,45,45,0.4)', borderRadius: 10,
    padding: 12, alignItems: 'center', marginTop: 12,
  },
  callButtonText: { color: '#FF6666', fontSize: 14, fontWeight: '600' },
  navButton: {
    backgroundColor: 'rgba(85,153,255,0.1)', borderWidth: 1,
    borderColor: 'rgba(85,153,255,0.3)', borderRadius: 10,
    padding: 12, alignItems: 'center', marginTop: 8,
  },
  navButtonText: { color: '#5599FF', fontSize: 14, fontWeight: '600' },
  locationBox: {
    backgroundColor: '#0A1A0A', borderRadius: 14, padding: 18,
    width: '100%', marginBottom: 16, borderWidth: 1, borderColor: '#1A3A1A',
  },
  locationTitle: { color: '#00D97E', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  locationText: { color: '#F0F0FF', fontSize: 13, fontFamily: 'monospace', paddingVertical: 2 },
  locationLink: { color: '#5599FF', fontSize: 12, marginTop: 10, textDecorationLine: 'underline' },
  contactsBox: {
    backgroundColor: '#0E0E1C', borderRadius: 14, padding: 18,
    width: '100%', borderWidth: 1, borderColor: '#1E1E3A',
  },
  contactsTitle: {
    color: '#9999BB', fontSize: 12, fontWeight: '600',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
  },
  contactItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1E1E3A' },
  contactText: { color: '#F0F0FF', fontSize: 14 },
  contactsHint: { color: '#555577', fontSize: 11, marginTop: 10, fontStyle: 'italic' },
});
