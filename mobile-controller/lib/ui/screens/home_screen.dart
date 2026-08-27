import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../../core/models/controller_models.dart';
import '../../core/network/udp_client.dart';
import 'controller_screen.dart';
import 'qr_scanner_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _ipController = TextEditingController(text: '10.0.2.2');
  final TextEditingController _portController = TextEditingController(text: '45455');
  final AutoDiscoveryClient _discovery = AutoDiscoveryClient();
  
  List<Map<String, dynamic>> _discoveredServers = [];
  List<GameProfile> _availableProfiles = [];
  GameProfile? _selectedProfile;
  bool _isSearching = true;

  @override
  void initState() {
    super.initState();
    _initBuiltinProfiles();
    _startDiscovery();
  }

  @override
  void dispose() {
    _discovery.stop();
    _ipController.dispose();
    _portController.dispose();
    super.dispose();
  }

  void _initBuiltinProfiles() {
    final ets2 = GameProfile(
      id: 'ets2-default',
      name: 'Euro Truck Simulator 2',
      description: 'Standard bindings and dashboard layout for ETS2.',
      buttons: [
        ControlButton(id: 'btn_engine', label: 'ENGINE', key: 'E', type: 'toggle', icon: 'power_settings_new', category: 'drivetrain'),
        ControlButton(id: 'btn_handbrake', label: 'PARK BRAKE', key: 'SPACE', type: 'toggle', icon: 'pan_tool', category: 'drivetrain'),
        ControlButton(id: 'btn_blinker_l', label: 'LEFT BLINKER', key: '[', type: 'toggle', icon: 'arrow_back', category: 'lighting'),
        ControlButton(id: 'btn_blinker_r', label: 'RIGHT BLINKER', key: ']', type: 'toggle', icon: 'arrow_forward', category: 'lighting'),
        ControlButton(id: 'btn_hazard', label: 'HAZARD', key: 'F', type: 'toggle', icon: 'warning', category: 'lighting'),
        ControlButton(id: 'btn_lights', label: 'LIGHTS', key: 'L', type: 'multi_stage', icon: 'wb_incandescent', category: 'lighting', maxStages: 3),
        ControlButton(id: 'btn_highbeam', label: 'HIGH BEAM', key: 'K', type: 'toggle', icon: 'highlight', category: 'lighting'),
        ControlButton(id: 'btn_horn', label: 'HORN', key: 'H', type: 'momentary', icon: 'volume_up', category: 'audio'),
        ControlButton(id: 'btn_airhorn', label: 'AIR HORN', key: 'N', type: 'momentary', icon: 'campaign', category: 'audio'),
        ControlButton(id: 'btn_wipers', label: 'WIPERS', key: 'P', type: 'multi_stage', icon: 'water_drop', category: 'cabin', maxStages: 3),
        ControlButton(id: 'btn_cruise', label: 'CRUISE CTRL', key: 'C', type: 'toggle', icon: 'speed', category: 'assistance'),
        ControlButton(id: 'btn_diff_lock', label: 'DIFF LOCK', key: 'V', type: 'toggle', icon: 'lock', category: 'drivetrain'),
        ControlButton(id: 'btn_shift_up', label: 'GEAR UP', key: 'SHIFT', type: 'momentary', icon: 'keyboard_arrow_up', category: 'transmission'),
        ControlButton(id: 'btn_shift_dn', label: 'GEAR DN', key: 'CTRL', type: 'momentary', icon: 'keyboard_arrow_down', category: 'transmission'),
      ],
    );

    final ats = GameProfile(
      id: 'ats-default',
      name: 'American Truck Simulator',
      description: 'Standard bindings and heavy-duty jake brake layout for ATS.',
      buttons: [
        ControlButton(id: 'btn_engine', label: 'ENGINE', key: 'E', type: 'toggle', icon: 'power_settings_new', category: 'drivetrain'),
        ControlButton(id: 'btn_handbrake', label: 'PARK BRAKE', key: 'SPACE', type: 'toggle', icon: 'pan_tool', category: 'drivetrain'),
        ControlButton(id: 'btn_blinker_l', label: 'LEFT BLINKER', key: '[', type: 'toggle', icon: 'arrow_back', category: 'lighting'),
        ControlButton(id: 'btn_blinker_r', label: 'RIGHT BLINKER', key: ']', type: 'toggle', icon: 'arrow_forward', category: 'lighting'),
        ControlButton(id: 'btn_hazard', label: 'HAZARD', key: 'F', type: 'toggle', icon: 'warning', category: 'lighting'),
        ControlButton(id: 'btn_jake', label: 'JAKE BRAKE', key: 'B', type: 'toggle', icon: 'compress', category: 'drivetrain'),
        ControlButton(id: 'btn_lights', label: 'LIGHTS', key: 'L', type: 'multi_stage', icon: 'wb_incandescent', category: 'lighting', maxStages: 3),
        ControlButton(id: 'btn_highbeam', label: 'HIGH BEAM', key: 'K', type: 'toggle', icon: 'highlight', category: 'lighting'),
        ControlButton(id: 'btn_horn', label: 'CITY HORN', key: 'H', type: 'momentary', icon: 'volume_up', category: 'audio'),
        ControlButton(id: 'btn_airhorn', label: 'AIR HORN', key: 'N', type: 'momentary', icon: 'campaign', category: 'audio'),
        ControlButton(id: 'btn_wipers', label: 'WIPERS', key: 'P', type: 'multi_stage', icon: 'water_drop', category: 'cabin', maxStages: 3),
        ControlButton(id: 'btn_cruise', label: 'CRUISE CTRL', key: 'C', type: 'toggle', icon: 'speed', category: 'assistance'),
        ControlButton(id: 'btn_shift_up', label: 'GEAR UP', key: 'SHIFT', type: 'momentary', icon: 'keyboard_arrow_up', category: 'transmission'),
        ControlButton(id: 'btn_shift_dn', label: 'GEAR DN', key: 'CTRL', type: 'momentary', icon: 'keyboard_arrow_down', category: 'transmission'),
      ],
    );

    final fernbus = GameProfile(
      id: 'fernbus-default',
      name: 'Fernbus Coach Simulator',
      description: 'Coach simulator layout with door controls, kneeling, and cabin lights.',
      buttons: [
        ControlButton(id: 'btn_engine', label: 'ENGINE', key: 'E', type: 'toggle', icon: 'power_settings_new', category: 'drivetrain'),
        ControlButton(id: 'btn_handbrake', label: 'PARK BRAKE', key: 'SPACE', type: 'toggle', icon: 'pan_tool', category: 'drivetrain'),
        ControlButton(id: 'btn_blinker_l', label: 'LEFT BLINKER', key: '[', type: 'toggle', icon: 'arrow_back', category: 'lighting'),
        ControlButton(id: 'btn_blinker_r', label: 'RIGHT BLINKER', key: ']', type: 'toggle', icon: 'arrow_forward', category: 'lighting'),
        ControlButton(id: 'btn_hazard', label: 'HAZARD', key: 'F', type: 'toggle', icon: 'warning', category: 'lighting'),
        ControlButton(id: 'btn_door_front', label: 'FRONT DOOR', key: '1', type: 'toggle', icon: 'meeting_room', category: 'coach'),
        ControlButton(id: 'btn_door_rear', label: 'REAR DOOR', key: '2', type: 'toggle', icon: 'door_sliding', category: 'coach'),
        ControlButton(id: 'btn_passenger_light', label: 'CABIN LIGHT', key: '8', type: 'multi_stage', icon: 'light_mode', category: 'coach', maxStages: 3),
        ControlButton(id: 'btn_kneeling', label: 'KNEELING', key: 'K', type: 'toggle', icon: 'airline_seat_recline_extra', category: 'coach'),
        ControlButton(id: 'btn_lights', label: 'LIGHTS', key: 'L', type: 'multi_stage', icon: 'wb_incandescent', category: 'lighting', maxStages: 3),
        ControlButton(id: 'btn_wipers', label: 'WIPERS', key: 'P', type: 'multi_stage', icon: 'water_drop', category: 'coach', maxStages: 3),
        ControlButton(id: 'btn_horn', label: 'HORN', key: 'H', type: 'momentary', icon: 'volume_up', category: 'audio'),
        ControlButton(id: 'btn_luggage', label: 'LUGGAGE', key: '3', type: 'toggle', icon: 'luggage', category: 'coach'),
      ],
    );

    _availableProfiles = [ets2, ats, fernbus];
    _selectedProfile = ets2;
  }

  void _startDiscovery() {
    _discovery.startListening(
      onFound: (host, udpPort, wsPort, hostname) {
        if (!_discoveredServers.any((s) => s['host'] == host)) {
          setState(() {
            _discoveredServers.add({
              'host': host,
              'udpPort': udpPort,
              'wsPort': wsPort,
              'hostname': hostname,
            });
            _ipController.text = host;
            _portController.text = udpPort.toString();
          });
        }
      },
    );
  }

  // --- Live Camera QR Scanner & Manual Paste Option ---
  Future<void> _openCameraQrScanner() async {
    final scannedPayload = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const QrScannerScreen()),
    );

    if (scannedPayload != null && scannedPayload.isNotEmpty) {
      _applyQrPayload(scannedPayload);
    }
  }

  void _applyQrPayload(String raw) {
    try {
      if (raw.startsWith('{')) {
        final map = jsonDecode(raw);
        if (map['ip'] != null) {
          setState(() {
            _ipController.text = map['ip'];
            if (map['udp'] != null) _portController.text = map['udp'].toString();
          });
        }
      } else if (raw.contains(':')) {
        final parts = raw.split(':');
        setState(() {
          _ipController.text = parts[0];
          _portController.text = parts[1];
        });
      }
    } catch (_) {}
  }

  void _showQrInputModal() {
    final qrTextCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('PAIR FROM QR CODE', style: TextStyle(color: Color(0xFF00F0FF), fontSize: 14, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00F0FF),
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                onPressed: () {
                  Navigator.of(ctx).pop();
                  _openCameraQrScanner();
                },
                icon: const Icon(Icons.camera_alt_rounded),
                label: const Text('SCAN WITH CAMERA', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(height: 16),
            const Center(child: Text('— OR PASTE PAYLOAD —', style: TextStyle(color: Color(0xFF64748B), fontSize: 10, fontWeight: FontWeight.bold))),
            const SizedBox(height: 12),
            TextField(
              controller: qrTextCtrl,
              maxLines: 2,
              style: const TextStyle(color: Colors.white, fontSize: 12),
              decoration: InputDecoration(
                hintText: '{"vgc":"1.0","ip":"192.168.1.5","udp":45455}',
                hintStyle: const TextStyle(color: Color(0xFF475569)),
                filled: true,
                fillColor: const Color(0xFF090D16),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('CANCEL', style: TextStyle(color: Color(0xFF94A3B8))),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00FF66), foregroundColor: Colors.black),
            onPressed: () {
              final raw = qrTextCtrl.text.trim();
              if (raw.isNotEmpty) _applyQrPayload(raw);
              Navigator.of(ctx).pop();
            },
            child: const Text('APPLY', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  // --- Create Custom Profile Dialog ---
  void _showCreateCustomProfileDialog() {
    final nameCtrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0F172A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('CREATE CUSTOM PROFILE', style: TextStyle(color: Color(0xFF00F0FF), fontSize: 14, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(labelText: 'Profile Name (e.g. MudRunner, BeamNG)', labelStyle: TextStyle(color: Color(0xFF94A3B8))),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('CANCEL', style: TextStyle(color: Color(0xFF94A3B8)))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00F0FF), foregroundColor: Colors.black),
            onPressed: () {
              if (nameCtrl.text.trim().isNotEmpty) {
                final newProf = GameProfile(
                  id: 'custom_${DateTime.now().millisecondsSinceEpoch}',
                  name: nameCtrl.text.trim(),
                  description: 'User created custom profile',
                  buttons: List.from(_selectedProfile?.buttons ?? []),
                );
                setState(() {
                  _availableProfiles.add(newProf);
                  _selectedProfile = newProf;
                });
                Navigator.of(ctx).pop();
              }
            },
            child: const Text('CREATE', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  void _launchController() {
    final host = _ipController.text.trim();
    final port = int.tryParse(_portController.text.trim()) ?? 45455;

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ControllerScreen(
          host: host,
          port: port,
          profile: _selectedProfile!,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF030712),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        title: const Text(
          'VIRTUAL GAMING CONTROLLER',
          style: TextStyle(
            color: Color(0xFF00F0FF),
            fontWeight: FontWeight.w900,
            letterSpacing: 2,
            fontSize: 15,
          ),
        ),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Auto Discovery Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFF00F0FF).withValues(alpha: 0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'DESKTOP HOST DISCOVERY',
                        style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1),
                      ),
                      Row(
                        children: [
                          IconButton(
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                            tooltip: 'Pair from QR payload',
                            icon: const Icon(Icons.qr_code_scanner_rounded, color: Color(0xFF00F0FF), size: 20),
                            onPressed: _showQrInputModal,
                          ),
                          if (_isSearching)
                            const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF00F0FF)),
                            )
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_discoveredServers.isEmpty)
                    const Text(
                      'Listening on subnet beacon (10.0.2.2 for AVD)... Tap QR icon to paste QR payload directly.',
                      style: TextStyle(color: Color(0xFF64748B), fontSize: 11),
                    )
                  else
                    Column(
                      children: _discoveredServers.map((s) {
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.desktop_windows_rounded, color: Color(0xFF00F0FF)),
                          title: Text(s['hostname'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                          subtitle: Text('${s['host']}:${s['udpPort']}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                          trailing: ElevatedButton(
                            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00F0FF), foregroundColor: Colors.black),
                            onPressed: () {
                              _ipController.text = s['host'];
                              _portController.text = s['udpPort'].toString();
                            },
                            child: const Text('SELECT', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
                          ),
                        );
                      }).toList(),
                    ),
                ],
              ),
            ),

            const SizedBox(height: 18),

            // Manual Connection
            const Text(
              'MANUAL CONNECTION & QR',
              style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: TextField(
                    controller: _ipController,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: InputDecoration(
                      labelText: 'Host IP Address (10.0.2.2)',
                      labelStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 11),
                      filled: true,
                      fillColor: const Color(0xFF0F172A),
                      isDense: true,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: TextField(
                    controller: _portController,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: 'UDP Port',
                      labelStyle: const TextStyle(color: Color(0xFF64748B), fontSize: 11),
                      filled: true,
                      fillColor: const Color(0xFF0F172A),
                      isDense: true,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 20),

            // Profile Selection (ETS2, ATS, Fernbus + Custom Profiles)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'GAMING PROFILES',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1),
                ),
                TextButton.icon(
                  onPressed: _showCreateCustomProfileDialog,
                  icon: const Icon(Icons.add, size: 14, color: Color(0xFF00FF66)),
                  label: const Text('NEW PROFILE', style: TextStyle(color: Color(0xFF00FF66), fontSize: 11, fontWeight: FontWeight.bold)),
                ),
              ],
            ),

            const SizedBox(height: 6),

            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _availableProfiles.map((prof) {
                final isSelected = _selectedProfile?.id == prof.id;
                return ChoiceChip(
                  avatar: Icon(
                    prof.id.contains('fernbus') ? Icons.directions_bus_rounded : Icons.local_shipping_rounded,
                    size: 16,
                    color: isSelected ? Colors.black : const Color(0xFF00F0FF),
                  ),
                  label: Text(prof.name, style: TextStyle(color: isSelected ? Colors.black : Colors.white, fontWeight: FontWeight.bold, fontSize: 11)),
                  selected: isSelected,
                  selectedColor: const Color(0xFF00F0FF),
                  backgroundColor: const Color(0xFF0F172A),
                  onSelected: (selected) {
                    if (selected) {
                      setState(() => _selectedProfile = prof);
                    }
                  },
                );
              }).toList(),
            ),

            const SizedBox(height: 24),

            // Start Controller Button
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00F0FF),
                  foregroundColor: const Color(0xFF030712),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  elevation: 8,
                ),
                onPressed: _launchController,
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.sports_esports_rounded, size: 24),
                    SizedBox(width: 8),
                    Text(
                      'START CONTROLLER',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 1.5),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
