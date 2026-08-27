import 'dart:convert';

class ControllerPacket {
  final int seq;
  final int timestamp;
  final String clientId;
  final double steer;     // -1.0 to 1.0
  final double throttle;  // 0.0 to 1.0
  final double brake;     // 0.0 to 1.0
  final List<String> buttonsDown;
  final List<String> buttonsUp;

  ControllerPacket({
    required this.seq,
    required this.timestamp,
    required this.clientId,
    required this.steer,
    required this.throttle,
    required this.brake,
    required this.buttonsDown,
    required this.buttonsUp,
  });

  Map<String, dynamic> toJson() {
    return {
      'seq': seq,
      'timestamp': timestamp,
      'clientId': clientId,
      'steer': double.parse(steer.toStringAsFixed(3)),
      'throttle': double.parse(throttle.toStringAsFixed(3)),
      'brake': double.parse(brake.toStringAsFixed(3)),
      'buttonsDown': buttonsDown,
      'buttonsUp': buttonsUp,
    };
  }

  String toJsonString() => jsonEncode(toJson());
}

class ControlButton {
  final String id;
  final String label;
  final String key;
  final String type; // 'toggle' | 'momentary' | 'multi_stage'
  final String icon;
  final String? category;
  final int maxStages; // For multi_stage buttons (e.g. 3: Off -> White -> Amber -> Green)
  int stage; // 0 = Off, 1 = Stage 1 (White), 2 = Stage 2 (Amber), 3 = Stage 3 (Green)
  bool isPressed;
  bool isToggled;

  ControlButton({
    required this.id,
    required this.label,
    required this.key,
    required this.type,
    required this.icon,
    this.category,
    this.maxStages = 3,
    this.stage = 0,
    this.isPressed = false,
    this.isToggled = false,
  });

  factory ControlButton.fromJson(Map<String, dynamic> json) {
    return ControlButton(
      id: json['id'] ?? '',
      label: json['label'] ?? '',
      key: json['key'] ?? '',
      type: json['type'] ?? 'momentary',
      icon: json['icon'] ?? 'touch_app',
      category: json['category'],
      maxStages: json['maxStages'] ?? 3,
      stage: json['stage'] ?? 0,
      isToggled: json['isToggled'] ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'label': label,
    'key': key,
    'type': type,
    'icon': icon,
    'category': category,
    'maxStages': maxStages,
    'stage': stage,
    'isToggled': isToggled,
  };
}

class GameProfile {
  final String id;
  String name;
  String description;
  List<ControlButton> buttons;

  GameProfile({
    required this.id,
    required this.name,
    required this.description,
    required this.buttons,
  });

  factory GameProfile.fromJson(Map<String, dynamic> json) {
    var rawButtons = json['buttons'] as List? ?? [];
    List<ControlButton> btnList = rawButtons
        .map((b) => ControlButton.fromJson(b as Map<String, dynamic>))
        .toList();

    return GameProfile(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'] ?? '',
      buttons: btnList,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'buttons': buttons.map((b) => b.toJson()).toList(),
  };
}
