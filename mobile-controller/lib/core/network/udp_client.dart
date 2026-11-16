import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

class UdpControllerClient {
  RawDatagramSocket? _socket;
  WebSocket? _webSocket;
  String host = '127.0.0.1';
  int port = 45455;
  int wsPort = 45450;
  InternetAddress? _cachedAddress;
  int _sequenceNumber = 0;
  bool _isConnected = false;

  // Pre-allocated reusable buffer for fast binary serialization (zero GC allocations)
  final Uint8List _packetBuffer = Uint8List(512);
  late final ByteData _byteData = ByteData.view(_packetBuffer.buffer);

  bool get isConnected => _isConnected;

  Future<void> connect(String targetHost, int targetPort, {int? targetWsPort}) async {
    host = targetHost;
    port = targetPort;
    wsPort = targetWsPort ?? targetPort;
    _socket?.close();
    try {
      _webSocket?.close();
    } catch (_) {}

    try {
      // Resolve address once and cache it to eliminate DNS/resolution lookup overhead per packet
      final addresses = await InternetAddress.lookup(host);
      _cachedAddress = addresses.isNotEmpty ? addresses.first : InternetAddress(host);
      
      _socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      _socket?.readEventsEnabled = false; // We only send, saving event loop cycles
      _isConnected = true;
    } catch (e) {
      try {
        _cachedAddress = InternetAddress(host);
        _socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
        _socket?.readEventsEnabled = false;
        _isConnected = true;
      } catch (_) {
        _isConnected = false;
      }
    }

    // Connect WebSocket bridge in background for guaranteed firewall-penetrating input delivery
    try {
      WebSocket.connect('ws://$host:$wsPort')
          .timeout(const Duration(milliseconds: 2500))
          .then((ws) {
        _webSocket = ws;
        _isConnected = true;
      }).catchError((_) {});
    } catch (_) {}
  }

  void sendInput({
    required double steer,
    required double throttle,
    required double brake,
    List<String> buttonsDown = const [],
    List<String> buttonsUp = const [],
  }) {
    final seq = _sequenceNumber++;
    final timestamp = DateTime.now().millisecondsSinceEpoch;

    // 1. Send via ultra-low latency UDP binary packet
    if (_socket != null && _cachedAddress != null) {
      // Header Magic: 0x56, 0x47 ('VG')
      _packetBuffer[0] = 0x56;
      _packetBuffer[1] = 0x47;

      // Sequence (uint32)
      _byteData.setUint32(2, seq, Endian.little);

      // Timestamp (int64)
      _byteData.setInt64(6, timestamp, Endian.little);

      // Steer [-1000..1000] (int16)
      final steerInt = (steer.clamp(-1.0, 1.0) * 1000).toInt();
      _byteData.setInt16(14, steerInt, Endian.little);

      // Throttle [0..1000] (int16)
      final throttleInt = (throttle.clamp(0.0, 1.0) * 1000).toInt();
      _byteData.setInt16(16, throttleInt, Endian.little);

      // Brake [0..1000] (int16)
      final brakeInt = (brake.clamp(0.0, 1.0) * 1000).toInt();
      _byteData.setInt16(18, brakeInt, Endian.little);

      int packetLen = 20;

      // Optional buttons payload
      if (buttonsDown.isNotEmpty || buttonsUp.isNotEmpty) {
        final extraJson = jsonEncode({
          if (buttonsDown.isNotEmpty) 'd': buttonsDown,
          if (buttonsUp.isNotEmpty) 'u': buttonsUp,
        });
        final extraBytes = utf8.encode(extraJson);
        final maxExtra = _packetBuffer.length - 20;
        final copyLen = extraBytes.length > maxExtra ? maxExtra : extraBytes.length;
        _packetBuffer.setRange(20, 20 + copyLen, extraBytes);
        packetLen += copyLen;
      }

      try {
        _socket!.send(
          Uint8List.view(_packetBuffer.buffer, 0, packetLen),
          _cachedAddress!,
          port,
        );
      } catch (_) {}
    }

    // 2. Also send over WebSocket bridge (guarantees inputs pass even if firewall blocks UDP)
    if (_webSocket != null) {
      try {
        _webSocket!.add(jsonEncode({
          'type': 'CONTROLLER_INPUT',
          'data': {
            'seq': seq,
            'timestamp': timestamp,
            'steer': steer,
            'throttle': throttle,
            'brake': brake,
            'buttonsDown': buttonsDown,
            'buttonsUp': buttonsUp
          }
        }));
      } catch (_) {}
    }
  }

  void disconnect() {
    _socket?.close();
    _socket = null;
    try {
      _webSocket?.close();
    } catch (_) {}
    _webSocket = null;
    _cachedAddress = null;
    _isConnected = false;
  }
}

class AutoDiscoveryClient {
  RawDatagramSocket? _broadcastSocket;
  StreamSubscription? _subscription;

  Future<void> startListening({
    required Function(String host, int udpPort, int wsPort, String hostname) onFound,
  }) async {
    try {
      _broadcastSocket = await RawDatagramSocket.bind(
        InternetAddress.anyIPv4,
        45456,
        reuseAddress: true,
      );

      _subscription = _broadcastSocket!.listen((event) {
        if (event == RawSocketEvent.read) {
          final datagram = _broadcastSocket!.receive();
          if (datagram != null) {
            try {
              final text = utf8.decode(datagram.data);
              final map = jsonDecode(text);
              if (map['service'] == 'VirtualGamingController') {
                String host = datagram.address.address;
                if (map['ips'] is List && (map['ips'] as List).isNotEmpty) {
                  host = (map['ips'] as List).first.toString();
                }
                onFound(
                  host,
                  map['udpPort'] ?? 45455,
                  map['wsPort'] ?? 45450,
                  map['hostname'] ?? 'Desktop PC',
                );
              }
            } catch (_) {}
          }
        }
      });
    } catch (e) {
      // In emulator or non-broadcast environments, user can enter IP manually
    }
  }

  void stop() {
    _subscription?.cancel();
    _subscription = null;
    _broadcastSocket?.close();
    _broadcastSocket = null;
  }
}
